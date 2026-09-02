"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { getSubmissionWindow, getWeekDays, DAY_LABELS, formatShortDate } from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { sendMailBackground } from "@/lib/mailer";
import { ADHOC_ARRIVAL_TIME_OPTIONS, isAdhocArrivalEligible } from "@/lib/constants/adhoc-arrival-times";
import { Role, WeeklyScheduleStatus, AdHocStatus } from "@/lib/constants/enums";

const VALID_DAY_VALUES = new Set([
  NO_TRANSPORT_VALUE,
  ...ARRIVAL_TIME_OPTIONS.map((o) => o.value),
]);
const VALID_ADHOC_TIMES = new Set(ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => o.value));
const ARRIVAL_VALUE_TO_LABEL = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

async function requireActiveEmployee(employeeId: unknown) {
  if (typeof employeeId !== "string" || !employeeId) {
    return { error: "Select an employee." } as const;
  }
  const employee = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!employee || employee.role !== Role.EMPLOYEE || !employee.isActive) {
    return { error: "Selected employee could not be found." } as const;
  }
  return { employee } as const;
}

function sendScheduleSubmittedNotice(args: {
  to: string;
  fullName: string;
  weekStartDate: Date;
  days: { dayOfWeek: number; date: Date; needsTransport: boolean; arrivalTime: string | null }[];
}) {
  const { to, fullName, weekStartDate, days } = args;
  const subject = "Your schedule has been submitted";
  const bodyRows = days
    .map((d) => {
      const label = d.needsTransport ? ARRIVAL_VALUE_TO_LABEL[d.arrivalTime ?? ""] ?? d.arrivalTime : "Not required";
      return `${DAY_LABELS[d.dayOfWeek - 1]} (${formatShortDate(d.date)}): ${d.needsTransport ? `Arrival ${label}` : "No transport"}`;
    })
    .join("\n");
  const htmlRows = days
    .map((d) => {
      const label = d.needsTransport ? ARRIVAL_VALUE_TO_LABEL[d.arrivalTime ?? ""] ?? d.arrivalTime : "Not required";
      return `
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">${DAY_LABELS[d.dayOfWeek - 1]} — ${formatShortDate(d.date)}</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${d.needsTransport ? label : "No transport"}</td>
        </tr>`;
    })
    .join("");
  after(async () => {
    await sendMailBackground({
      to,
      subject,
      body: `Hi ${fullName},\n\nYour weekly schedule for the week of ${weekStartDate.toDateString()} has been submitted successfully.\n\nDay-wise schedule:\n${bodyRows}\n\nTo view your current week schedule and find your day-wise assignment, please log in to the system and open the "My Schedule" page.\n\nThank you.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Your Schedule Has Been Submitted</h2>
          <p>Hi <strong>${fullName}</strong>,</p>
          <p>Your weekly schedule for the week of <strong>${weekStartDate.toDateString()}</strong> has been submitted successfully.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            ${htmlRows}
          </table>
          <p>To view your current week schedule and find your day-wise assignment, please <strong>log in to the system</strong> and open the <strong>My Schedule</strong> page.</p>
          <p style="color: #6c757d; margin-top: 24px;">Best regards,<br><strong>Transportation Team</strong></p>
        </div>
      `,
    });
  });
}

export type CreateWeeklyScheduleOnBehalfState = {
  error?: string;
  success?: boolean;
  employeeName?: string;
};

export async function createWeeklyScheduleOnBehalf(
  _prevState: CreateWeeklyScheduleOnBehalfState,
  formData: FormData
): Promise<CreateWeeklyScheduleOnBehalfState> {
  const session = await requireRole([Role.OPERATIONS]);

  const lookup = await requireActiveEmployee(formData.get("employeeId"));
  if ("error" in lookup) return { error: lookup.error };
  const { employee } = lookup;

  const settings = await getTransportSettings();
  const window = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  const weekDates = getWeekDays(window.weekStartDate);

  const dayValues: string[] = [];
  for (let i = 0; i < 5; i++) {
    const value = formData.get(`day-${i}`);
    if (typeof value !== "string" || !VALID_DAY_VALUES.has(value)) {
      return { error: "Please select a value for every day." };
    }
    dayValues.push(value);
  }

  const existing = await prisma.weeklySchedule.findUnique({
    where: {
      employeeId_weekStartDate: {
        employeeId: employee.id,
        weekStartDate: window.weekStartDate,
      },
    },
  });

  const scheduleId = existing
    ? existing.id
    : (
        await prisma.weeklySchedule.create({
          data: { employeeId: employee.id, weekStartDate: window.weekStartDate },
        })
      ).id;

  await prisma.weeklySchedule.update({
    where: { id: scheduleId },
    data: {
      status: WeeklyScheduleStatus.APPROVED,
      rejectReason: null,
      submittedAt: new Date(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  const submittedDays: Parameters<typeof sendScheduleSubmittedNotice>[0]["days"] = [];
  for (let i = 0; i < 5; i++) {
    const value = dayValues[i];
    const needsTransport = value !== NO_TRANSPORT_VALUE;
    submittedDays.push({
      dayOfWeek: i + 1,
      date: weekDates[i],
      needsTransport,
      arrivalTime: needsTransport ? value : null,
    });
    await prisma.weeklyScheduleDay.upsert({
      where: {
        weeklyScheduleId_dayOfWeek: { weeklyScheduleId: scheduleId, dayOfWeek: i + 1 },
      },
      update: {
        needsTransport,
        arrivalTime: needsTransport ? value : null,
        date: weekDates[i],
      },
      create: {
        weeklyScheduleId: scheduleId,
        dayOfWeek: i + 1,
        date: weekDates[i],
        needsTransport,
        arrivalTime: needsTransport ? value : null,
      },
    });
  }

  sendScheduleSubmittedNotice({
    to: employee.email,
    fullName: employee.fullName,
    weekStartDate: window.weekStartDate,
    days: submittedDays,
  });

  revalidatePath("/operations/weekly-requests");
  revalidatePath("/facilities/weekly-export");
  return { success: true, employeeName: employee.fullName };
}

export type CreateAdHocRequestOnBehalfState = {
  error?: string;
  success?: boolean;
  employeeName?: string;
};

export async function createAdHocRequestOnBehalf(
  _prevState: CreateAdHocRequestOnBehalfState,
  formData: FormData
): Promise<CreateAdHocRequestOnBehalfState> {
  const session = await requireRole([Role.OPERATIONS]);

  const lookup = await requireActiveEmployee(formData.get("employeeId"));
  if ("error" in lookup) return { error: lookup.error };
  const { employee } = lookup;

  const dateValue = formData.get("date");
  const arrivalTime = formData.get("arrivalTime");
  const reason = formData.get("reason");

  if (typeof dateValue !== "string" || !dateValue) {
    return { error: "Select a date." };
  }
  if (typeof arrivalTime !== "string" || !VALID_ADHOC_TIMES.has(arrivalTime)) {
    return { error: "Please select a valid arrival time." };
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { error: "Invalid date." };
  }

  if (!isAdhocArrivalEligible(date, arrivalTime)) {
    return {
      error:
        "Ad-hoc requests need at least 3 hours' notice. Please choose a later arrival time.",
    };
  }

  await prisma.adHocRequest.create({
    data: {
      employeeId: employee.id,
      date,
      arrivalTime,
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      status: AdHocStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  return { success: true, employeeName: employee.fullName };
}
