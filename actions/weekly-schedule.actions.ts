"use server";


import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import {
  getSubmissionWindowForWeek,
  getWeekDays,
  getMondayOfWeek,
  normalizeWeekStart,
  DAY_LABELS,
  formatShortDate,
} from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import {
  NO_TRANSPORT_VALUE,
  ARRIVAL_TIME_OPTIONS,
  normalizeArrivalTimeInput,
} from "@/lib/constants/arrival-times";
import { sendMailBackground, isEmailEnabled } from "@/lib/mailer";
import { scheduleSubmittedEmail } from "@/lib/email-templates";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { parseCsv } from "@/lib/csv";
import { sanitizedActionError } from "@/lib/actions/action-error";
import { audit } from "@/lib/audit";

const ARRIVAL_VALUE_TO_LABEL = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

type SubmitNoticeArgs = {
  to: string;
  fullName: string;
  weekStartDate: Date;
  days: { dayOfWeek: number; date: Date; needsTransport: boolean; arrivalTime: string | null }[];
};

async function sendScheduleSubmittedNotice({ to, fullName, weekStartDate, days }: SubmitNoticeArgs) {
  const email = scheduleSubmittedEmail({
    employeeName: fullName,
    weekStartDate,
    days: days.map((d) => {
      const label = d.needsTransport
        ? ARRIVAL_VALUE_TO_LABEL[d.arrivalTime ?? ""] ?? d.arrivalTime ?? ""
        : "Not required";
      return {
        label: `${DAY_LABELS[d.dayOfWeek - 1]} — ${formatShortDate(d.date)}`,
        value: d.needsTransport ? label : "No transport",
      };
    }),
  });

  await sendMailBackground({
    to,
    subject: email.subject,
    body: email.body,
    html: email.html,
  });
}

const VALID_DAY_VALUES = new Set([
  NO_TRANSPORT_VALUE,
  ...ARRIVAL_TIME_OPTIONS.map((o) => o.value),
]);

export type SubmitCorporateWeeklyScheduleState = {
  error?: string;
  success?: boolean;
};

/** Corporate Employee self-submit -- no Operations review step. The schedule is
 *  saved as already approved so it flows straight to Facilities route
 *  planning, subject only to the weekly submission-window lock. */
export async function submitCorporateWeeklySchedule(
  _prevState: SubmitCorporateWeeklyScheduleState,
  formData: FormData
): Promise<SubmitCorporateWeeklyScheduleState> {
  const session = await requireRole([Role.CORPORATE_EMPLOYEE]);

  try {
  const settings = await getTransportSettings();
  const now = new Date();

  const weekStartValue = formData.get("weekStartDate");
  if (typeof weekStartValue !== "string" || !weekStartValue) {
    return { error: "Select a week to submit for." };
  }
  const parsedWeek = new Date(weekStartValue);
  if (Number.isNaN(parsedWeek.getTime())) {
    return { error: "Invalid week." };
  }
  // Canonical week key: UTC-midnight Monday of the selected week's Dhaka
  // calendar week. Each selected week is gated by its own Saturday-midnight
  // submission window -- no open window, no submit.
  const weekStartDate = normalizeWeekStart(parsedWeek);
  const selectedWindow = getSubmissionWindowForWeek(
    weekStartDate,
    now,
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  if (now.getTime() < selectedWindow.opensAt.getTime()) {
    return { error: "Submissions for this week are not open yet." };
  }
  if (!selectedWindow.isOpen) {
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
          data: {
            employeeId: session.id,
            weekStartDate,
          },
        })
      ).id;

  // No Operations review step -- every corporate submission lands as already
  // approved so Facilities route planning picks it up directly. Re-submits
  // while the window is open simply overwrite the previous days.
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

  // The 5 day rows are independent (unique per dayOfWeek) — one concurrent
  // batch instead of 5 sequential round trips.
  await Promise.all(
    dayValues.map((value, i) => {
      const needsTransport = value !== NO_TRANSPORT_VALUE;
      return prisma.weeklyScheduleDay.upsert({
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
    })
  );

  await audit(session, {
    action: "SUBMIT_WEEKLY_SCHEDULE",
    entityType: "WeeklySchedule",
    entityId: scheduleId,
    before: existing
      ? { status: existing.status, rejectReason: existing.rejectReason }
      : undefined,
    after: {
      status: WeeklyScheduleStatus.APPROVED,
      weekStartDate,
      days: dayValues,
    },
    description: `${session.fullName} submitted their weekly schedule for the week of ${weekStartDate.toDateString()} (auto-approved, straight to Facilities).`,
  });

  revalidatePath("/corporate-employee/my-schedule");
  revalidatePath("/operations/weekly-requests");
  revalidatePath("/facilities/route-planning");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("submitCorporateWeeklySchedule", error);
  }
}

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

  try {
  const weekStartValue = formData.get("weekStartDate");
  if (typeof weekStartValue !== "string" || !weekStartValue) {
    return { error: "Missing week." };
  }
  const weekStartDate = new Date(weekStartValue);
  if (Number.isNaN(weekStartDate.getTime())) {
    return { error: "Invalid week." };
  }
  // Canonical week key: UTC-midnight Monday of the Dhaka calendar week
  // (getMondayOfWeek always normalizes — RUN MAPPING queries this exact value,
  // and a local-midnight key would make the schedule invisible to it).
  const normalizedWeekStart = getMondayOfWeek(weekStartDate);

  const dayValues: string[] = [];
  for (let i = 0; i < 5; i++) {
    const value = formData.get(`day-${i}`);
    if (typeof value !== "string" || !VALID_DAY_VALUES.has(value)) {
      return { error: "Please select a value for every day." };
    }
    dayValues.push(value);
  }

  const weekDates = getWeekDays(normalizedWeekStart);

  const existing = await prisma.weeklySchedule.findUnique({
    where: {
      employeeId_weekStartDate: {
        employeeId: session.id,
        weekStartDate: normalizedWeekStart,
      },
    },
  });

  const scheduleId = existing
    ? existing.id
    : (
        await prisma.weeklySchedule.create({
          data: { employeeId: session.id, weekStartDate: normalizedWeekStart },
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

  const submittedDays: SubmitNoticeArgs["days"] = dayValues.map((value, i) => {
    const needsTransport = value !== NO_TRANSPORT_VALUE;
    return {
      dayOfWeek: i + 1,
      date: weekDates[i],
      needsTransport,
      arrivalTime: needsTransport ? value : null,
    };
  });
  // The 5 day rows are independent (unique per dayOfWeek) — one concurrent
  // batch instead of 5 sequential round trips.
  await Promise.all(
    submittedDays.map((d) =>
      prisma.weeklyScheduleDay.upsert({
        where: {
          weeklyScheduleId_dayOfWeek: {
            weeklyScheduleId: scheduleId,
            dayOfWeek: d.dayOfWeek,
          },
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
    action: "SUBMIT_WEEKLY_SCHEDULE",
    entityType: "WeeklySchedule",
    entityId: scheduleId,
    before: existing ? { status: existing.status } : undefined,
    after: {
      status: WeeklyScheduleStatus.APPROVED,
      weekStartDate: normalizedWeekStart,
      days: submittedDays,
    },
    description: `${session.fullName} submitted their own weekly schedule for the week of ${normalizedWeekStart.toDateString()} (auto-approved).`,
  });

  after(async () => {
    await sendScheduleSubmittedNotice({
      to: session.email,
      fullName: session.fullName,
      weekStartDate,
      days: submittedDays,
    });
  });

  revalidatePath("/operations/my-schedule");
  revalidatePath("/operations/weekly-requests");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("submitMySchedule", error);
  }
}

export type ApproveSchedulesState = {
  error?: string;
};

export async function approveSchedules(
  _prevState: ApproveSchedulesState,
  formData: FormData
): Promise<ApproveSchedulesState> {
  const session = await requireRole([Role.OPERATIONS]);

  try {
  const ids = formData.getAll("scheduleId").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) {
    return { error: "Select at least one schedule to approve." };
  }

  // Single batched write — only PENDING rows transition (same semantics as
  // the previous per-row loop, without N round trips).
  const { count } = await prisma.weeklySchedule.updateMany({
    where: { id: { in: ids }, status: WeeklyScheduleStatus.PENDING },
    data: {
      status: WeeklyScheduleStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  if (count > 0) {
    await audit(session, {
      action: "APPROVE_WEEKLY_SCHEDULES",
      entityType: "WeeklySchedule",
      before: { status: WeeklyScheduleStatus.PENDING, requestedIds: ids },
      after: { status: WeeklyScheduleStatus.APPROVED, approvedCount: count },
      description: `${session.fullName} approved ${count} weekly schedule${count === 1 ? "" : "s"}.`,
    });
  }

  revalidatePath("/operations/weekly-requests");
  return {};
  } catch (error) {
    return sanitizedActionError("approveSchedules", error);
  }
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

  try {
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
    include: { days: true, employee: { select: { fullName: true } } },
  });
  if (!schedule) {
    return { error: "Schedule not found." };
  }

  const weekDates = getWeekDays(schedule.weekStartDate);

  // The 5 day rows are independent (unique per dayOfWeek) — one concurrent
  // batch instead of 5 sequential round trips.
  await Promise.all(
    dayValues.map((value, i) => {
      const needsTransport = value !== NO_TRANSPORT_VALUE;
      return prisma.weeklyScheduleDay.upsert({
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
    })
  );

  await audit(session, {
    action: "EDIT_WEEKLY_SCHEDULE",
    entityType: "WeeklySchedule",
    entityId: schedule.id,
    before: {
      days: schedule.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        needsTransport: d.needsTransport,
        arrivalTime: d.arrivalTime,
      })),
    },
    after: { days: dayValues },
    description: `${session.fullName} edited ${schedule.employee.fullName}'s weekly schedule for the week of ${schedule.weekStartDate.toDateString()}.`,
  });

  revalidatePath("/operations/weekly-requests");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("editWeeklySchedule", error);
  }
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

  try {
  const scheduleId = formData.get("scheduleId");
  const reason = formData.get("reason");

  if (typeof scheduleId !== "string" || !scheduleId) {
    return { error: "Missing schedule." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "A rejection reason is required." };
  }

  // Atomic PENDING -> REJECTED transition: a concurrent approve/reject can't
  // be overwritten, and already-reviewed schedules can't be re-rejected.
  const { count } = await prisma.weeklySchedule.updateMany({
    where: { id: scheduleId, status: WeeklyScheduleStatus.PENDING },
    data: {
      status: WeeklyScheduleStatus.REJECTED,
      rejectReason: reason.trim(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  const schedule = await prisma.weeklySchedule.findUnique({
    where: { id: scheduleId },
    select: { weekStartDate: true, employee: { select: { fullName: true } } },
  });
  if (!schedule) {
    return { error: "Schedule not found." };
  }
  if (count !== 1) {
    return { error: "This request was already reviewed." };
  }

  await audit(session, {
    action: "REJECT_WEEKLY_SCHEDULE",
    entityType: "WeeklySchedule",
    entityId: scheduleId,
    before: { status: WeeklyScheduleStatus.PENDING },
    after: { status: WeeklyScheduleStatus.REJECTED, rejectReason: reason.trim() },
    description: `${session.fullName} rejected ${schedule.employee.fullName}'s weekly schedule for the week of ${schedule.weekStartDate.toDateString()}.`,
  });

  revalidatePath("/operations/weekly-requests");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("rejectSchedule", error);
  }
}

const ARRIVAL_LABEL_TO_VALUE = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.label.toLowerCase(), o.value])
);

function parseDayCell(cell: string): string | null {
  const normalized = normalizeArrivalTimeInput(cell);
  if (normalized === NO_TRANSPORT_VALUE) return NO_TRANSPORT_VALUE;
  if (normalized && VALID_DAY_VALUES.has(normalized)) return normalized;

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
  results?: {
    created: BulkUploadWeeklyResultRow[];
    skipped: BulkUploadWeeklySkipRow[];
    /** False in development — the mailer skips sending outside production. */
    emailsEnabled: boolean;
  };
};

const DAY_HEADER_ALIASES: Record<string, string[]> = {
  monday: ["monday", "mon"],
  tuesday: ["tuesday", "tue", "tues"],
  wednesday: ["wednesday", "wed"],
  thursday: ["thursday", "thu", "thur", "thurs"],
  friday: ["friday", "fri"],
};
const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const NAME_HEADER_ALIASES = ["employee name", "name", "fullname", "full name"];
const EMAIL_HEADER_ALIASES = ["employee email", "email", "email address", "emailaddress"];

function findColumn(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.includes(h.trim().toLowerCase()));
}

export async function bulkUploadWeeklySchedules(
  _prevState: BulkUploadWeeklyScheduleState,
  formData: FormData
): Promise<BulkUploadWeeklyScheduleState> {
  const session = await requireRole([Role.OPERATIONS]);

  try {
  const weekStartValue = formData.get("weekStartDate");
  if (typeof weekStartValue !== "string" || !weekStartValue) {
    return { error: "Select a week to upload for." };
  }
  const parsedWeek = new Date(weekStartValue);
  if (Number.isNaN(parsedWeek.getTime())) {
    return { error: "Invalid week." };
  }
  // Canonical week key: UTC-midnight Monday of the selected week's Dhaka
  // calendar week (RUN MAPPING queries this exact value — a local-midnight key
  // would make the schedule invisible to it).
  const weekStartDate = getMondayOfWeek(parsedWeek);
  const weekDates = getWeekDays(weekStartDate);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file." };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "The CSV must have a header row and at least one data row." };
  }

  // Header: Employee Name, Employee Email, Monday, Tuesday, Wednesday, Thursday, Friday
  const header = rows[0].map((h) => h.trim().toLowerCase());

  const nameCol = findColumn(header, NAME_HEADER_ALIASES);
  if (nameCol === -1) {
    return { error: 'CSV must have an "Employee Name" column.' };
  }
  const emailCol = findColumn(header, EMAIL_HEADER_ALIASES);
  if (emailCol === -1) {
    return { error: 'CSV must have an "Employee Email" column.' };
  }

  const dayIndexes: { day: string; col: number }[] = [];
  for (const day of DAY_ORDER) {
    const col = header.findIndex((h) => DAY_HEADER_ALIASES[day].includes(h.trim()));
    if (col === -1) {
      return {
        error: `CSV must have a "${day[0].toUpperCase()}${day.slice(1)}" column. Missing "${day}".`,
      };
    }
    dayIndexes.push({ day, col });
  }

  const created: BulkUploadWeeklyResultRow[] = [];
  const skipped: BulkUploadWeeklySkipRow[] = [];

  // Pre-fetch every referenced employee in ONE query (was: one `findUnique`
  // per row — the biggest DB-side slowdown on large files).
  const emailsInFile = [
    ...new Set(
      rows
        .slice(1)
        .map((row) => (row[emailCol] ?? "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  const employeesByEmail = new Map(
    (
      await prisma.user.findMany({
        where: { email: { in: emailsInFile } },
        select: { id: true, email: true, fullName: true, role: true, isActive: true },
      })
    ).map((user) => [user.email, user])
  );

  // One batched read for this week's schedules instead of a findUnique per
  // row. Rows created by this upload join the map so a repeated email in the
  // file is still reported as a duplicate.
  const existingSchedulesByEmployee = new Map(
    (
      await prisma.weeklySchedule.findMany({
        where: {
          employeeId: {
            in: Array.from(new Set([...employeesByEmail.values()].map((u) => u.id))),
          },
          weekStartDate,
        },
        select: { employeeId: true, createdAt: true },
      })
    ).map((s) => [s.employeeId, s.createdAt] as const)
  );

  // Validated rows are collected here and written in TWO batched statements
  // below (one createMany per table) instead of a per-row create + 5 upserts
  // (was: ~6 sequential writes per row — 200 rows ≈ 1,200 round trips).
  // Emails are collected alongside and sent AFTER the response (via `after`).
  const validRows: {
    employee: { id: string; email: string; fullName: string };
    dayValues: string[];
  }[] = [];
  // Tracks employees already accepted from this file so a repeated email is
  // still reported as a duplicate (the DB pre-read above can't see them).
  const seenEmployeeIds = new Set<string>();
  const now = new Date();
  const todayStamp = now.toISOString().split("T")[0];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;
    const rawName = (row[nameCol] ?? "").trim();
    const rawEmail = (row[emailCol] ?? "").trim().toLowerCase();

    if (!rawEmail) {
      skipped.push({ line, reason: "Missing employee email." });
      continue;
    }
    if (!rawName) {
      skipped.push({ line, reason: `Missing employee name for "${rawEmail}".` });
      continue;
    }

    // Match by unique email — the rest of the profile comes from the database.
    const employee = employeesByEmail.get(rawEmail);
    if (!employee) {
      skipped.push({ line, reason: `No employee found with email "${rawEmail}".` });
      continue;
    }
    if (employee.role !== Role.EMPLOYEE || !employee.isActive) {
      skipped.push({ line, reason: `"${rawEmail}" is not an active employee.` });
      continue;
    }

    // Safety cross-check: uploaded name should match the system record for that email.
    if (employee.fullName.trim().toLowerCase() !== rawName.toLowerCase()) {
      skipped.push({
        line,
        reason: `Name mismatch for "${rawEmail}": system has "${employee.fullName}", uploaded "${rawName}".`,
      });
      continue;
    }

    const dayValues: string[] = [];
    let invalidCell: { col: string; value: string } | null = null;
    for (const { day, col } of dayIndexes) {
      const parsed = parseDayCell(row[col] ?? "");
      if (parsed === null) {
        invalidCell = { col: day, value: row[col] ?? "" };
        break;
      }
      dayValues.push(parsed);
    }
    if (invalidCell !== null) {
      skipped.push({
        line,
        reason: `Invalid arrival time "${invalidCell.value}" for ${invalidCell.col} (email "${rawEmail}").`,
      });
      continue;
    }

    // Check for existing schedule — one employee, one schedule per week.
    const duplicateCreatedAt = existingSchedulesByEmployee.get(employee.id);
    if (duplicateCreatedAt) {
      skipped.push({
        line,
        reason: `Duplicate entry for "${rawEmail}" — schedule for this week already exists (created ${duplicateCreatedAt.toISOString().split("T")[0]}).`,
      });
      continue;
    }
    if (seenEmployeeIds.has(employee.id)) {
      skipped.push({
        line,
        reason: `Duplicate entry for "${rawEmail}" — schedule for this week already exists (created ${todayStamp}).`,
      });
      continue;
    }
    seenEmployeeIds.add(employee.id);

    // Deferred to the batched writes below (no upsert — duplicates are
    // caught above).
    validRows.push({
      employee: { id: employee.id, email: employee.email, fullName: employee.fullName },
      dayValues,
    });
  }

  // Two batched statements for the whole file: schedules first (days need
  // their IDs — createMany returns only a count, so IDs are re-read by the
  // same unique key), then all 5N day rows in one createMany. Fresh schedules
  // have no days yet, so plain creates are correct — no upserts needed.
  if (validRows.length > 0) {
    await prisma.weeklySchedule.createMany({
      data: validRows.map((v) => ({
        employeeId: v.employee.id,
        weekStartDate,
        status: WeeklyScheduleStatus.APPROVED,
        rejectReason: null,
        submittedAt: now,
        reviewedById: session.id,
        reviewedAt: now,
      })),
    });
    const scheduleIdByEmployee = new Map(
      (
        await prisma.weeklySchedule.findMany({
          where: {
            employeeId: { in: validRows.map((v) => v.employee.id) },
            weekStartDate,
          },
          select: { id: true, employeeId: true },
        })
      ).map((s) => [s.employeeId, s.id] as const)
    );
    const dayRows = validRows.flatMap((v) => {
      const scheduleId = scheduleIdByEmployee.get(v.employee.id);
      if (!scheduleId) return [];
      return [0, 1, 2, 3, 4].map((d) => {
        const value = v.dayValues[d];
        const needsTransport = value !== NO_TRANSPORT_VALUE;
        return {
          weeklyScheduleId: scheduleId,
          dayOfWeek: d + 1,
          date: weekDates[d],
          needsTransport,
          arrivalTime: needsTransport ? value : null,
        };
      });
    });
    if (dayRows.length !== validRows.length * 5) {
      throw new Error("Bulk upload wrote an incomplete week. Retry the upload.");
    }
    await prisma.weeklyScheduleDay.createMany({ data: dayRows });
  }

  const notices: SubmitNoticeArgs[] = validRows.map((v) => ({
    to: v.employee.email,
    fullName: v.employee.fullName,
    weekStartDate,
    days: [0, 1, 2, 3, 4].map((d) => {
      const value = v.dayValues[d];
      const needsTransport = value !== NO_TRANSPORT_VALUE;
      return {
        dayOfWeek: d + 1,
        date: weekDates[d],
        needsTransport,
        arrivalTime: needsTransport ? value : null,
      };
    }),
  }));

  for (const v of validRows) {
    created.push({ employeeName: v.employee.fullName, email: v.employee.email });
  }

  // Send all schedule emails after the response is returned (was: awaited per
  // row — the #1 reason bulk upload felt slow in production).
  // Sent sequentially over the pooled transporter (an unbounded fan-out
  // would open a burst of SMTP connections). sendMailBackground never throws.
  after(async () => {
    for (const notice of notices) {
      await sendScheduleSubmittedNotice(notice);
    }
  });

  if (created.length > 0) {
    await audit(session, {
      action: "BULK_UPLOAD_WEEKLY_SCHEDULES",
      entityType: "WeeklySchedule",
      after: {
        weekStartDate,
        createdCount: created.length,
        skippedCount: skipped.length,
        created: created.map((c) => c.email),
      },
      description: `${session.fullName} bulk-uploaded ${created.length} weekly schedule${created.length === 1 ? "" : "s"} for the week of ${weekStartDate.toDateString()} (${skipped.length} row${skipped.length === 1 ? "" : "s"} skipped).`,
    });
  }

  revalidatePath("/operations/weekly-requests");
  revalidatePath("/employee/weekly");
  return {
    results: {
      created,
      skipped,
      emailsEnabled: isEmailEnabled(),
    },
  };
  } catch (error) {
    return sanitizedActionError("bulkUploadWeeklySchedules", error);
  }
}
