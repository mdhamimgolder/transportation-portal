"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { trySendMail } from "@/lib/mailer";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { transportArrangedEmail } from "@/lib/email-templates";
import type { SessionUser } from "@/lib/auth/session";

export type AssignRouteState = {
  error?: string;
  success?: boolean;
};

type AssignmentEmailKind = "ROUTE_ASSIGNMENT_WEEKLY" | "ROUTE_ASSIGNMENT_ADHOC";

/** Registers the fire-and-forget delivery for one assignment. A PENDING log
 *  row is written synchronously (so the UI shows the attempt immediately),
 *  and the `after()` callback records SENT/FAILED + stamps `emailSentAt` only
 *  when the SMTP send actually succeeded. */
async function dispatchAssignmentEmail(params: {
  assignmentId: string;
  kind: AssignmentEmailKind;
  employeeName: string;
  employeeEmail: string;
  date: Date;
  driverName: string;
  driverContact: string;
  vehicleNumber: string;
  pickupTime: string;
}) {
  const email = transportArrangedEmail({
    kind: params.kind === "ROUTE_ASSIGNMENT_ADHOC" ? "ADHOC" : "WEEKLY",
    employeeName: params.employeeName,
    date: params.date,
    driverName: params.driverName,
    contactNumber: params.driverContact,
    vehicleNumber: params.vehicleNumber,
    pickupTime: params.pickupTime,
  });

  const log = await prisma.emailNotificationLog.create({
    data: {
      kind: params.kind,
      recipient: params.employeeEmail,
      recipientName: params.employeeName,
      subject: email.subject,
      routeAssignmentId: params.assignmentId,
      status: "PENDING",
    },
  });

  after(async () => {
    const outcome = await trySendMail({
      to: params.employeeEmail,
      subject: email.subject,
      body: email.body,
      html: email.html,
    });
    await prisma.emailNotificationLog.update({
      where: { id: log.id },
      data: { status: outcome.status, error: outcome.error ?? null },
    });
    if (outcome.status === "SENT") {
      await prisma.routeAssignment.update({
        where: { id: params.assignmentId },
        data: { emailSentAt: new Date() },
      });
    }
    revalidatePath("/facilities/route-planning");
  });
}

async function upsertAssignmentForWeeklyDay(params: {
  weeklyScheduleDayId: string;
  vehicleDriverId: string;
  pickupTime: string;
  actor: SessionUser;
}) {
  const { weeklyScheduleDayId, vehicleDriverId, pickupTime, actor } = params;

  const day = await prisma.weeklyScheduleDay.findUnique({
    where: { id: weeklyScheduleDayId },
    include: { weeklySchedule: { include: { employee: true } } },
  });
  if (!day) throw new Error("Day not found.");

  const vehicleDriver = await prisma.vehicleDriver.findUnique({
    where: { id: vehicleDriverId },
  });
  if (!vehicleDriver) throw new Error("Select a valid vehicle & driver.");

  const assignment = await prisma.routeAssignment.upsert({
    where: { weeklyScheduleDayId },
    update: {
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
      assignedAt: new Date(),
    },
    create: {
      weeklyScheduleDayId,
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
    },
  });

  const employee = day.weeklySchedule.employee;

  const existing = await prisma.routeAssignment.findUnique({
    where: { weeklyScheduleDayId: day.id },
  });
  const detailsChanged =
    !existing ||
    existing.vehicleDriverId !== vehicleDriverId ||
    existing.pickupTime !== pickupTime ||
    !existing.emailSentAt;

  if (detailsChanged) {
    await dispatchAssignmentEmail({
      assignmentId: assignment.id,
      kind: "ROUTE_ASSIGNMENT_WEEKLY",
      employeeName: employee.fullName,
      employeeEmail: employee.email,
      date: day.date,
      driverName: vehicleDriver.driverName,
      driverContact: vehicleDriver.contactNumber,
      vehicleNumber: vehicleDriver.vehicleNumber,
      pickupTime,
    });
  }

  return assignment;
}

async function upsertAssignmentForAdHoc(params: {
  adHocRequestId: string;
  vehicleDriverId: string;
  pickupTime: string;
  actor: SessionUser;
}) {
  const { adHocRequestId, vehicleDriverId, pickupTime, actor } = params;

  const request = await prisma.adHocRequest.findUnique({
    where: { id: adHocRequestId },
    include: { employee: true },
  });
  if (!request) throw new Error("Request not found.");

  const vehicleDriver = await prisma.vehicleDriver.findUnique({
    where: { id: vehicleDriverId },
  });
  if (!vehicleDriver) throw new Error("Select a valid vehicle & driver.");

  const assignment = await prisma.routeAssignment.upsert({
    where: { adHocRequestId },
    update: {
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
      assignedAt: new Date(),
    },
    create: {
      adHocRequestId,
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
    },
  });

  await prisma.adHocRequest.update({
    where: { id: adHocRequestId },
    data: { status: AdHocStatus.ASSIGNED },
  });

  const existing = await prisma.routeAssignment.findUnique({
    where: { adHocRequestId: adHocRequestId },
  });
  const detailsChanged =
    !existing ||
    existing.vehicleDriverId !== vehicleDriverId ||
    existing.pickupTime !== pickupTime ||
    !existing.emailSentAt;

  if (detailsChanged) {
    await dispatchAssignmentEmail({
      assignmentId: assignment.id,
      kind: "ROUTE_ASSIGNMENT_ADHOC",
      employeeName: request.employee.fullName,
      employeeEmail: request.employee.email,
      date: request.date,
      driverName: vehicleDriver.driverName,
      driverContact: vehicleDriver.contactNumber,
      vehicleNumber: vehicleDriver.vehicleNumber,
      pickupTime,
    });
  }

  return assignment;
}

export async function assignRoute(
  _prevState: AssignRouteState,
  formData: FormData
): Promise<AssignRouteState> {
  const session = await requireRole([Role.FACILITIES]);

  const weeklyScheduleDayId = formData.get("weeklyScheduleDayId");
  const adHocRequestId = formData.get("adHocRequestId");
  const vehicleDriverId = formData.get("vehicleDriverId");
  const pickupTime = formData.get("pickupTime");
  const commentRaw = formData.get("comment");
  const comment = typeof commentRaw === "string" ? commentRaw.trim() : "";

  const hasFullAssignment =
    typeof vehicleDriverId === "string" &&
    vehicleDriverId.length > 0 &&
    typeof pickupTime === "string" &&
    pickupTime.length > 0;

  try {
    if (typeof weeklyScheduleDayId === "string" && weeklyScheduleDayId) {
      if (!hasFullAssignment) {
        return { error: "Select a vehicle & driver and a pickup time." };
      }
      await upsertAssignmentForWeeklyDay({
        weeklyScheduleDayId,
        vehicleDriverId: vehicleDriverId as string,
        pickupTime: pickupTime as string,
        actor: session,
      });
      revalidatePath("/facilities/route-planning");
    } else if (typeof adHocRequestId === "string" && adHocRequestId) {
      if (!hasFullAssignment && !comment) {
        return {
          error: "Provide a vehicle & pickup time, or a note for the employee.",
        };
      }
      if (hasFullAssignment) {
        await upsertAssignmentForAdHoc({
          adHocRequestId,
          vehicleDriverId: vehicleDriverId as string,
          pickupTime: pickupTime as string,
          actor: session,
        });
      }
      await prisma.adHocRequest.update({
        where: { id: adHocRequestId },
        data: { facilitiesComment: comment || null },
      });
      revalidatePath("/facilities/adhoc");
      revalidatePath("/operations/adhoc");
      revalidatePath("/employee/adhoc");
    } else {
      return { error: "Missing assignment target." };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }

  return { success: true };
}

export type SaveDaySheetState = {
  error?: string;
  savedCount?: number;
  skipped?: { employeeName: string; reason: string }[];
};



/**
 * Bulk-saves the day-first planning sheet: Facilities fills in Pick-up Time
 * and Vehicle No (often via pasting a column from an external sheet) for as
 * many rows as are ready, then saves everything at once. Untouched rows are
 * skipped silently; partially-filled or unrecognized-vehicle rows are
 * reported back but don't block the rows that are valid.
 */
export async function saveDaySheetAssignments(
  _prevState: SaveDaySheetState,
  formData: FormData
): Promise<SaveDaySheetState> {
  const session = await requireRole([Role.FACILITIES]);

  const dayIds = formData.getAll("weeklyScheduleDayId").map(String);
  const employeeNames = formData.getAll("employeeName").map(String);
  const pickupTimes = formData.getAll("pickupTime").map(String);
  const vehicleNumbers = formData.getAll("vehicleNumber").map(String);

  if (dayIds.length === 0) {
    return { error: "Nothing to save." };
  }

  const activeVehicleDrivers = await prisma.vehicleDriver.findMany({
    where: { isActive: true },
  });
  const byVehicleNumber = new Map(
    activeVehicleDrivers.map((v) => [v.vehicleNumber.trim().toUpperCase(), v])
  );

  let savedCount = 0;
  const skipped: { employeeName: string; reason: string }[] = [];

  for (let i = 0; i < dayIds.length; i++) {
    const pickupTime = pickupTimes[i]?.trim() ?? "";
    const vehicleNumber = vehicleNumbers[i]?.trim() ?? "";
    const employeeName = employeeNames[i] ?? "Unknown employee";

    if (!pickupTime && !vehicleNumber) continue;

    if (!pickupTime || !vehicleNumber) {
      skipped.push({
        employeeName,
        reason: !pickupTime ? "Missing pick-up time." : "Missing vehicle number.",
      });
      continue;
    }

    const vehicleDriver = byVehicleNumber.get(vehicleNumber.toUpperCase());
    if (!vehicleDriver) {
      skipped.push({ employeeName, reason: `Vehicle "${vehicleNumber}" not found.` });
      continue;
    }

    try {
      await upsertAssignmentForWeeklyDay({
        weeklyScheduleDayId: dayIds[i],
        vehicleDriverId: vehicleDriver.id,
        pickupTime,
        actor: session,
      });
      savedCount++;
    } catch (error) {
      skipped.push({
        employeeName,
        reason: error instanceof Error ? error.message : "Failed to save.",
      });
    }
  }

  revalidatePath("/facilities/route-planning");
  return { savedCount, skipped };
}

export type SheetMutationState = { error?: string };

/** Accepts "HH:mm" or "h[:mm] AM/PM"; returns canonical "HH:mm" or null. */
function normalizeSheetPickupTime(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const m = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (minutes > 59) return null;
  const suffix = m[3]?.toUpperCase();
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Re-fetch the assignment so the mutation keeps the same upsert/email path
 * the day sheet uses (a change emails the employee, exactly like "Save all"). */
async function assignmentForDay(weeklyScheduleDayId: string) {
  return prisma.routeAssignment.findUnique({ where: { weeklyScheduleDayId } });
}

/** Inline pick-up-time edit from the route sheet row. */
export async function updateSheetPickupTime(
  weeklyScheduleDayId: string,
  pickupTimeRaw: string
): Promise<SheetMutationState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  const pickupTime = normalizeSheetPickupTime(pickupTimeRaw);
  if (!pickupTime) {
    return { error: "Pick-up time must be HH:mm (or e.g. 8:35 PM)." };
  }
  const existing = await assignmentForDay(weeklyScheduleDayId);
  if (!existing) {
    return { error: "Assign a vehicle first — drag the row onto a vehicle card." };
  }
  if (existing.pickupTime !== pickupTime) {
    await upsertAssignmentForWeeklyDay({
      weeklyScheduleDayId,
      vehicleDriverId: existing.vehicleDriverId,
      pickupTime,
      actor: session,
    });
  }
  revalidatePath("/facilities/route-planning");
  return {};
}

/** Drag a row onto another vehicle card: the employee moves, keeping time. */
export async function moveSheetAssignment(
  weeklyScheduleDayId: string,
  vehicleDriverId: string
): Promise<SheetMutationState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  const existing = await assignmentForDay(weeklyScheduleDayId);
  if (!existing) {
    return { error: "Set a pick-up time in the day sheet first — an unassigned row cannot be moved yet." };
  }
  if (existing.vehicleDriverId !== vehicleDriverId) {
    await upsertAssignmentForWeeklyDay({
      weeklyScheduleDayId,
      vehicleDriverId,
      pickupTime: existing.pickupTime,
      actor: session,
    });
  }
  revalidatePath("/facilities/route-planning");
  return {};
}

/** Drag a row onto another row: the two rows exchange vehicle and time. */
export async function swapSheetAssignments(
  draggedDayId: string,
  targetDayId: string
): Promise<SheetMutationState> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  if (draggedDayId === targetDayId) return {};
  const [a, b] = await Promise.all([
    assignmentForDay(draggedDayId),
    assignmentForDay(targetDayId),
  ]);
  if (!a || !b) {
    return { error: "Both rows need a saved assignment (vehicle + pick-up time) before they can swap." };
  }
  if (a.vehicleDriverId === b.vehicleDriverId && a.pickupTime === b.pickupTime) {
    return {};
  }
  await prisma.$transaction([
    prisma.routeAssignment.update({
      where: { weeklyScheduleDayId: draggedDayId },
      data: { vehicleDriverId: b.vehicleDriverId, pickupTime: b.pickupTime },
    }),
    prisma.routeAssignment.update({
      where: { weeklyScheduleDayId: targetDayId },
      data: { vehicleDriverId: a.vehicleDriverId, pickupTime: a.pickupTime },
    }),
  ]);
  revalidatePath("/facilities/route-planning");
  return {};
}

export async function replicateAcrossWeek(formData: FormData): Promise<void> {
  const session = await requireRole([Role.FACILITIES]);
  const sourceDayId = formData.get("sourceDayId");
  if (typeof sourceDayId !== "string" || !sourceDayId) return;

  const sourceDay = await prisma.weeklyScheduleDay.findUnique({
    where: { id: sourceDayId },
    include: {
      routeAssignment: true,
      weeklySchedule: { include: { days: true } },
    },
  });
  if (!sourceDay?.routeAssignment) return;

  const { vehicleDriverId, pickupTime } = sourceDay.routeAssignment;
  const otherDays = sourceDay.weeklySchedule.days.filter(
    (d) => d.id !== sourceDay.id && d.needsTransport
  );

  for (const day of otherDays) {
    await upsertAssignmentForWeeklyDay({
      weeklyScheduleDayId: day.id,
      vehicleDriverId,
      pickupTime,
      actor: session,
    });
  }

  revalidatePath("/facilities/route-planning");
}

export async function copyLastWeekRoutes(formData: FormData): Promise<void> {
  const session = await requireRole([Role.FACILITIES]);
  const weeklyScheduleId = formData.get("weeklyScheduleId");
  if (typeof weeklyScheduleId !== "string" || !weeklyScheduleId) return;

  const schedule = await prisma.weeklySchedule.findUnique({
    where: { id: weeklyScheduleId },
    include: { days: true },
  });
  if (!schedule) return;

  const lastWeekStart = new Date(
    schedule.weekStartDate.getTime() - 7 * 24 * 60 * 60 * 1000
  );
  const lastWeekSchedule = await prisma.weeklySchedule.findUnique({
    where: {
      employeeId_weekStartDate: {
        employeeId: schedule.employeeId,
        weekStartDate: lastWeekStart,
      },
    },
    include: { days: { include: { routeAssignment: true } } },
  });
  if (!lastWeekSchedule) return;

  for (const day of schedule.days) {
    if (!day.needsTransport) continue;

    const existingAssignment = await prisma.routeAssignment.findUnique({
      where: { weeklyScheduleDayId: day.id },
    });
    if (existingAssignment) continue;

    const lastWeekDay = lastWeekSchedule.days.find(
      (d) => d.dayOfWeek === day.dayOfWeek
    );
    if (!lastWeekDay?.routeAssignment) continue;

    await upsertAssignmentForWeeklyDay({
      weeklyScheduleDayId: day.id,
      vehicleDriverId: lastWeekDay.routeAssignment.vehicleDriverId,
      pickupTime: lastWeekDay.routeAssignment.pickupTime,
      actor: session,
    });
  }

  revalidatePath("/facilities/route-planning");
}

export type ResendEmailState = {
  error?: string;
  status?: "SENT" | "SKIPPED_DEV" | "FAILED";
};

/** One-off re-dispatch of an employee notification for a saved assignment.
 *  Unlike the bulk flow this AWAITS the send so Facilities gets the outcome
 *  right away (a single email is fast). */
export async function resendRouteAssignmentEmail(
  _prevState: ResendEmailState,
  formData: FormData
): Promise<ResendEmailState> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const routeAssignmentId = formData.get("routeAssignmentId");
  if (typeof routeAssignmentId !== "string" || !routeAssignmentId) {
    return { error: "Missing assignment." };
  }

  const assignment = await prisma.routeAssignment.findUnique({
    where: { id: routeAssignmentId },
    include: {
      vehicleDriver: true,
      weeklyScheduleDay: {
        include: { weeklySchedule: { include: { employee: true } } },
      },
      adHocRequest: { include: { employee: true } },
    },
  });
  if (!assignment) return { error: "Assignment not found." };

  const employee =
    assignment.weeklyScheduleDay?.weeklySchedule.employee ??
    assignment.adHocRequest?.employee;
  if (!employee) return { error: "Employee not linked to this assignment." };

  const date =
    assignment.weeklyScheduleDay?.date ?? assignment.adHocRequest?.date;
  if (!date) return { error: "Assignment has no travel date." };

  const email = transportArrangedEmail({
    kind: assignment.adHocRequestId ? "ADHOC" : "WEEKLY",
    employeeName: employee.fullName,
    date,
    driverName: assignment.vehicleDriver.driverName,
    contactNumber: assignment.vehicleDriver.contactNumber,
    vehicleNumber: assignment.vehicleDriver.vehicleNumber,
    pickupTime: assignment.pickupTime,
  });

  const outcome = await trySendMail({
    to: employee.email,
    subject: email.subject,
    body: email.body,
    html: email.html,
  });

  await prisma.emailNotificationLog.create({
    data: {
      kind: "ROUTE_ASSIGNMENT_RESEND",
      recipient: employee.email,
      recipientName: employee.fullName,
      subject: email.subject,
      routeAssignmentId: assignment.id,
      status: outcome.status,
      error: outcome.error ?? null,
    },
  });

  if (outcome.status === "SENT") {
    await prisma.routeAssignment.update({
      where: { id: assignment.id },
      data: { emailSentAt: new Date() },
    });
  }

  revalidatePath("/facilities/route-planning");
  revalidatePath("/facilities/email-log");
  return { status: outcome.status, error: outcome.error };
}
