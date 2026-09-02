"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { getSubmissionWindow, getWeekDays } from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { ADHOC_ARRIVAL_TIME_OPTIONS, isAdhocArrivalEligible } from "@/lib/constants/adhoc-arrival-times";
import { Role, WeeklyScheduleStatus, AdHocStatus } from "@/lib/constants/enums";

const VALID_DAY_VALUES = new Set([
  NO_TRANSPORT_VALUE,
  ...ARRIVAL_TIME_OPTIONS.map((o) => o.value),
]);
const VALID_ADHOC_TIMES = new Set(ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => o.value));

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

  for (let i = 0; i < 5; i++) {
    const value = dayValues[i];
    const needsTransport = value !== NO_TRANSPORT_VALUE;
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
