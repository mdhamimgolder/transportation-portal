"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { getWeekDays } from "@/lib/date/week";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { parseCsv } from "@/lib/csv";

const VALID_DAY_VALUES = new Set([
  NO_TRANSPORT_VALUE,
  ...ARRIVAL_TIME_OPTIONS.map((o) => o.value),
]);

export type SubmitMyScheduleState = {
  error?: string;
  success?: boolean;
};

/** Operations staff submitting their own weekly transport schedule. Unlike the
 *  old employee self-submit flow, there's no lock window and no review step --
 *  it's saved as already approved, same as the on-behalf/bulk-upload paths. */
export async function submitMySchedule(
  _prevState: SubmitMyScheduleState,
  formData: FormData
): Promise<SubmitMyScheduleState> {
  const session = await requireRole([Role.OPERATIONS]);

  const weekStartValue = formData.get("weekStartDate");
  if (typeof weekStartValue !== "string" || !weekStartValue) {
    return { error: "Missing week." };
  }
  const weekStartDate = new Date(weekStartValue);
  if (Number.isNaN(weekStartDate.getTime())) {
    return { error: "Invalid week." };
  }

  const dayValues: string[] = [];
  for (let i = 0; i < 5; i++) {
    const value = formData.get(`day-${i}`);
    if (typeof value !== "string" || !VALID_DAY_VALUES.has(value)) {
      return { error: "Please select a value for every day." };
    }
    dayValues.push(value);
  }

  const weekDates = getWeekDays(weekStartDate);

  const existing = await prisma.weeklySchedule.findUnique({
    where: {
      employeeId_weekStartDate: {
        employeeId: session.id,
        weekStartDate,
      },
    },
  });

  const scheduleId = existing
    ? existing.id
    : (
        await prisma.weeklySchedule.create({
          data: { employeeId: session.id, weekStartDate },
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
        weeklyScheduleId_dayOfWeek: {
          weeklyScheduleId: scheduleId,
          dayOfWeek: i + 1,
        },
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

  revalidatePath("/operations/my-schedule");
  revalidatePath("/operations/weekly-requests");
  revalidatePath("/facilities/weekly-export");
  return { success: true };
}

export type ApproveSchedulesState = {
  error?: string;
};

export async function approveSchedules(
  _prevState: ApproveSchedulesState,
  formData: FormData
): Promise<ApproveSchedulesState> {
  const session = await requireRole([Role.OPERATIONS]);

  const ids = formData.getAll("scheduleId").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) {
    return { error: "Select at least one schedule to approve." };
  }

  const schedules = await prisma.weeklySchedule.findMany({
    where: { id: { in: ids }, status: WeeklyScheduleStatus.PENDING },
  });

  for (const schedule of schedules) {
    await prisma.weeklySchedule.update({
      where: { id: schedule.id },
      data: {
        status: WeeklyScheduleStatus.APPROVED,
        reviewedById: session.id,
        reviewedAt: new Date(),
      },
    });
  }

  revalidatePath("/operations/weekly-requests");
  return {};
}

export type EditWeeklyScheduleState = {
  error?: string;
  success?: boolean;
};

export async function editWeeklySchedule(
  _prevState: EditWeeklyScheduleState,
  formData: FormData
): Promise<EditWeeklyScheduleState> {
  const session = await requireRole([Role.OPERATIONS]);

  const scheduleId = formData.get("scheduleId");
  if (typeof scheduleId !== "string" || !scheduleId) {
    return { error: "Missing schedule." };
  }

  const dayValues: string[] = [];
  for (let i = 0; i < 5; i++) {
    const value = formData.get(`day-${i}`);
    if (typeof value !== "string" || !VALID_DAY_VALUES.has(value)) {
      return { error: "Please select a value for every day." };
    }
    dayValues.push(value);
  }

  const schedule = await prisma.weeklySchedule.findUnique({
    where: { id: scheduleId },
    include: { days: true },
  });
  if (!schedule) {
    return { error: "Schedule not found." };
  }

  const weekDates = getWeekDays(schedule.weekStartDate);

  for (let i = 0; i < 5; i++) {
    const value = dayValues[i];
    const needsTransport = value !== NO_TRANSPORT_VALUE;
    await prisma.weeklyScheduleDay.upsert({
      where: {
        weeklyScheduleId_dayOfWeek: {
          weeklyScheduleId: schedule.id,
          dayOfWeek: i + 1,
        },
      },
      update: {
        needsTransport,
        arrivalTime: needsTransport ? value : null,
        date: weekDates[i],
      },
      create: {
        weeklyScheduleId: schedule.id,
        dayOfWeek: i + 1,
        date: weekDates[i],
        needsTransport,
        arrivalTime: needsTransport ? value : null,
      },
    });
  }

  revalidatePath("/operations/weekly-requests");
  return { success: true };
}

export type RejectScheduleState = {
  error?: string;
  success?: boolean;
};

export async function rejectSchedule(
  _prevState: RejectScheduleState,
  formData: FormData
): Promise<RejectScheduleState> {
  const session = await requireRole([Role.OPERATIONS]);

  const scheduleId = formData.get("scheduleId");
  const reason = formData.get("reason");

  if (typeof scheduleId !== "string" || !scheduleId) {
    return { error: "Missing schedule." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "A rejection reason is required." };
  }

  const schedule = await prisma.weeklySchedule.findUnique({
    where: { id: scheduleId },
  });
  if (!schedule) {
    return { error: "Schedule not found." };
  }

  await prisma.weeklySchedule.update({
    where: { id: scheduleId },
    data: {
      status: WeeklyScheduleStatus.REJECTED,
      rejectReason: reason.trim(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/operations/weekly-requests");
  return { success: true };
}

const ARRIVAL_LABEL_TO_VALUE = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.label.toLowerCase(), o.value])
);

function parseDayCell(cell: string): string | null {
  const trimmed = cell.trim();
  if (!trimmed || trimmed.toLowerCase() === "not required") return NO_TRANSPORT_VALUE;
  if (trimmed.toUpperCase() === NO_TRANSPORT_VALUE) return NO_TRANSPORT_VALUE;
  const mapped = ARRIVAL_LABEL_TO_VALUE[trimmed.toLowerCase()];
  if (mapped) return mapped;
  if (VALID_DAY_VALUES.has(trimmed)) return trimmed;
  return null;
}

export type BulkUploadWeeklyResultRow = { employeeName: string; email: string };
export type BulkUploadWeeklySkipRow = { line: number; reason: string };
export type BulkUploadWeeklyScheduleState = {
  error?: string;
  results?: { created: BulkUploadWeeklyResultRow[]; skipped: BulkUploadWeeklySkipRow[] };
};

export async function bulkUploadWeeklySchedules(
  _prevState: BulkUploadWeeklyScheduleState,
  formData: FormData
): Promise<BulkUploadWeeklyScheduleState> {
  const session = await requireRole([Role.OPERATIONS]);

  const weekStartValue = formData.get("weekStartDate");
  if (typeof weekStartValue !== "string" || !weekStartValue) {
    return { error: "Select a week to upload for." };
  }
  const weekStartDate = new Date(weekStartValue);
  if (Number.isNaN(weekStartDate.getTime())) {
    return { error: "Invalid week." };
  }
  const weekDates = getWeekDays(weekStartDate);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file." };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "The CSV file has no data rows." };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name);
  const idx = {
    email: colIndex("employee email"),
    monday: colIndex("monday"),
    tuesday: colIndex("tuesday"),
    wednesday: colIndex("wednesday"),
    thursday: colIndex("thursday"),
    friday: colIndex("friday"),
  };
  if (Object.values(idx).some((v) => v === -1)) {
    return {
      error:
        "CSV must include Employee Email, Monday, Tuesday, Wednesday, Thursday, and Friday columns.",
    };
  }
  const dayCols = [idx.monday, idx.tuesday, idx.wednesday, idx.thursday, idx.friday];

  const created: BulkUploadWeeklyResultRow[] = [];
  const skipped: BulkUploadWeeklySkipRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cols = rows[i];
    const email = cols[idx.email]?.trim().toLowerCase();
    if (!email) {
      skipped.push({ line, reason: "Missing employee email." });
      continue;
    }

    const employee = await prisma.user.findUnique({ where: { email } });
    if (!employee || employee.role !== Role.EMPLOYEE || !employee.isActive) {
      skipped.push({ line, reason: `No active employee found with email ${email}.` });
      continue;
    }

    const dayValues: string[] = [];
    let invalidCell: string | null = null;
    for (const colIdx of dayCols) {
      const parsed = parseDayCell(cols[colIdx] ?? "");
      if (parsed === null) {
        invalidCell = cols[colIdx];
        break;
      }
      dayValues.push(parsed);
    }
    if (invalidCell !== null) {
      skipped.push({ line, reason: `Invalid arrival time value "${invalidCell}".` });
      continue;
    }

    const existing = await prisma.weeklySchedule.findUnique({
      where: {
        employeeId_weekStartDate: { employeeId: employee.id, weekStartDate },
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

    for (let d = 0; d < 5; d++) {
      const value = dayValues[d];
      const needsTransport = value !== NO_TRANSPORT_VALUE;
      await prisma.weeklyScheduleDay.upsert({
        where: {
          weeklyScheduleId_dayOfWeek: { weeklyScheduleId: scheduleId, dayOfWeek: d + 1 },
        },
        update: {
          needsTransport,
          arrivalTime: needsTransport ? value : null,
          date: weekDates[d],
        },
        create: {
          weeklyScheduleId: scheduleId,
          dayOfWeek: d + 1,
          date: weekDates[d],
          needsTransport,
          arrivalTime: needsTransport ? value : null,
        },
      });
    }

    created.push({ employeeName: employee.fullName, email: employee.email });
  }

  revalidatePath("/operations/weekly-requests");
  revalidatePath("/facilities/weekly-export");
  return { results: { created, skipped } };
}
