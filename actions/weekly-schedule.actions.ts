"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import { getSubmissionWindow, getWeekDays } from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import {
  Role,
  AuditActionType,
  WeeklyScheduleStatus,
} from "@/lib/constants/enums";

export type SubmitWeeklyScheduleState = {
  error?: string;
  success?: boolean;
};

const VALID_DAY_VALUES = new Set([
  NO_TRANSPORT_VALUE,
  ...ARRIVAL_TIME_OPTIONS.map((o) => o.value),
]);

export async function submitWeeklySchedule(
  _prevState: SubmitWeeklyScheduleState,
  formData: FormData
): Promise<SubmitWeeklyScheduleState> {
  const session = await requireRole([Role.EMPLOYEE]);

  const settings = await getTransportSettings();
  const window = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  if (!window.isOpen) {
    return { error: "The submission window for this week has closed." };
  }

  const dayValues: string[] = [];
  for (let i = 0; i < 5; i++) {
    const value = formData.get(`day-${i}`);
    if (typeof value !== "string" || !VALID_DAY_VALUES.has(value)) {
      return { error: "Please select a value for every day." };
    }
    dayValues.push(value);
  }

  const weekDates = getWeekDays(window.weekStartDate);

  const existing = await prisma.weeklySchedule.findUnique({
    where: {
      employeeId_weekStartDate: {
        employeeId: session.id,
        weekStartDate: window.weekStartDate,
      },
    },
  });

  if (existing && existing.status === WeeklyScheduleStatus.APPROVED) {
    return {
      error:
        "This week's schedule has already been approved and can no longer be changed.",
    };
  }

  const scheduleId = existing
    ? existing.id
    : (
        await prisma.weeklySchedule.create({
          data: {
            employeeId: session.id,
            weekStartDate: window.weekStartDate,
          },
        })
      ).id;

  if (existing) {
    await prisma.weeklySchedule.update({
      where: { id: existing.id },
      data: {
        status: WeeklyScheduleStatus.PENDING,
        rejectReason: null,
        submittedAt: new Date(),
      },
    });
  }

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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.SCHEDULE_SUBMITTED,
    entityType: "WeeklySchedule",
    entityId: scheduleId,
    after: dayValues,
    description: `${session.fullName} submitted a weekly schedule for the week of ${window.weekStartDate.toDateString()}`,
  });

  revalidatePath("/employee/weekly");
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

    await writeAuditLog({
      actor: { id: session.id, email: session.email, role: session.role },
      actionType: AuditActionType.SCHEDULE_APPROVED,
      entityType: "WeeklySchedule",
      entityId: schedule.id,
      before: { status: schedule.status },
      after: { status: WeeklyScheduleStatus.APPROVED },
      description: `${session.fullName} approved a weekly schedule (week of ${schedule.weekStartDate.toDateString()})`,
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
    include: { days: true, employee: true },
  });
  if (!schedule) {
    return { error: "Schedule not found." };
  }

  const weekDates = getWeekDays(schedule.weekStartDate);
  const beforeValues = Array.from({ length: 5 }, (_, i) => {
    const day = schedule.days.find((d) => d.dayOfWeek === i + 1);
    return day && day.needsTransport && day.arrivalTime
      ? day.arrivalTime
      : NO_TRANSPORT_VALUE;
  });

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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.SCHEDULE_EDITED,
    entityType: "WeeklySchedule",
    entityId: schedule.id,
    before: beforeValues,
    after: dayValues,
    description: `${session.fullName} edited ${schedule.employee.fullName}'s weekly schedule (week of ${schedule.weekStartDate.toDateString()})`,
  });

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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.SCHEDULE_REJECTED,
    entityType: "WeeklySchedule",
    entityId: scheduleId,
    before: { status: schedule.status },
    after: { status: WeeklyScheduleStatus.REJECTED, reason: reason.trim() },
    description: `${session.fullName} rejected a weekly schedule (week of ${schedule.weekStartDate.toDateString()}): ${reason.trim()}`,
  });

  revalidatePath("/operations/weekly-requests");
  return { success: true };
}
