"use server";

import { escapeHtml } from "@/lib/html";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { getSubmissionWindow, getWeekDays, toUtcMidnight, parseDayKey, DAY_LABELS, formatShortDate } from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { sendMailBackground } from "@/lib/mailer";
import { ADHOC_ARRIVAL_TIME_OPTIONS, isAdhocArrivalEligible } from "@/lib/constants/adhoc-arrival-times";
import { Role, WeeklyScheduleStatus, AdHocStatus } from "@/lib/constants/enums";
import { sanitizedActionError } from "@/lib/actions/action-error";
import { audit } from "@/lib/audit";

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
          <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
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

  try {
    // Independent reads — fetch concurrently.
    const [lookup, settings] = await Promise.all([
      requireActiveEmployee(formData.get("employeeId")),
      getTransportSettings(),
    ]);
    if ("error" in lookup) return { error: lookup.error };
    const { employee } = lookup;

  const window = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  // Canonical UTC-midnight Monday of the open window's Dhaka calendar week — the
  // exact key RUN MAPPING and every schedule lookup uses.
  const weekStartDate = toUtcMidnight(window.weekStartDate);
  const weekDates = getWeekDays(weekStartDate);

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
        weekStartDate,
      },
    },
  });

  const scheduleId = existing
    ? existing.id
    : (
        await prisma.weeklySchedule.create({
          data: { employeeId: employee.id, weekStartDate },
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

  const submittedDays: Parameters<typeof sendScheduleSubmittedNotice>[0]["days"] = dayValues.map(
    (value, i) => {
      const needsTransport = value !== NO_TRANSPORT_VALUE;
      return {
        dayOfWeek: i + 1,
        date: weekDates[i],
        needsTransport,
        arrivalTime: needsTransport ? value : null,
      };
    }
  );
  // The 5 day rows are independent (unique per dayOfWeek) — one concurrent
  // batch instead of 5 sequential round trips.
  await Promise.all(
    submittedDays.map((d) =>
      prisma.weeklyScheduleDay.upsert({
        where: {
          weeklyScheduleId_dayOfWeek: { weeklyScheduleId: scheduleId, dayOfWeek: d.dayOfWeek },
        },
        update: {
          needsTransport: d.needsTransport,
          arrivalTime: d.arrivalTime,
          date: d.date,
        },
        create: {
          weeklyScheduleId: scheduleId,
          dayOfWeek: d.dayOfWeek,
          date: d.date,
          needsTransport: d.needsTransport,
          arrivalTime: d.arrivalTime,
        },
      })
    )
  );

  await audit(session, {
    action: "CREATE_WEEKLY_SCHEDULE_ON_BEHALF",
    entityType: "WeeklySchedule",
    entityId: scheduleId,
    before: existing ? { status: existing.status } : undefined,
    after: {
      employeeId: employee.id,
      status: WeeklyScheduleStatus.APPROVED,
      weekStartDate,
      days: submittedDays,
    },
    description: `${session.fullName} created a weekly schedule on behalf of ${employee.fullName} for the week of ${weekStartDate.toDateString()}.`,
  });

  // sendScheduleSubmittedNotice schedules its own after() — no extra layer.
  sendScheduleSubmittedNotice({
    to: employee.email,
    fullName: employee.fullName,
    weekStartDate,
    days: submittedDays,
  });

  revalidatePath("/operations/weekly-requests");
  return { success: true, employeeName: employee.fullName };
  } catch (error) {
    return sanitizedActionError("createWeeklyScheduleOnBehalf", error);
  }
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

  try {
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

  // parseDayKey treats "yyyy-mm-dd" as a Dhaka calendar date (canonical UTC
  // midnight key) — unlike `new Date("…T00:00:00")`, which parses host-local
  // and shifts the day on non-Dhaka servers.
  const parsedDate = parseDayKey(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return { error: "Invalid date." };
  }
  // Day keys are stored at UTC midnight so date lookups never depend on the
  // server's timezone.
  const date = toUtcMidnight(parsedDate);

  if (!isAdhocArrivalEligible(date, arrivalTime)) {
    return {
      error:
        "Ad-hoc requests need at least 3 hours' notice. Please choose a later arrival time.",
    };
  }

  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;
  const created = await prisma.adHocRequest.create({
    data: {
      employeeId: employee.id,
      date,
      arrivalTime,
      reason: cleanReason,
      status: AdHocStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
    select: { id: true },
  });

  await audit(session, {
    action: "CREATE_ADHOC_ON_BEHALF",
    entityType: "AdHocRequest",
    entityId: created.id,
    after: {
      employeeId: employee.id,
      date,
      arrivalTime,
      reason: cleanReason,
      status: AdHocStatus.APPROVED,
    },
    description: `${session.fullName} created an ad-hoc request on behalf of ${employee.fullName} for ${dateValue} (arrival ${arrivalTime}).`,
  });

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  return { success: true, employeeName: employee.fullName };
  } catch (error) {
    return sanitizedActionError("createAdHocRequestOnBehalf", error);
  }
}
