"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { sendMail } from "@/lib/mailer";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import type { SessionUser } from "@/lib/auth/session";

export type AssignRouteState = {
  error?: string;
  success?: boolean;
};

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
      emailSentAt: new Date(),
    },
    create: {
      weeklyScheduleDayId,
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
      emailSentAt: new Date(),
    },
  });

  const employee = day.weeklySchedule.employee;
  await sendMail({
    to: employee.email,
    subject: "Your transport has been arranged",
    body: `Hi ${employee.fullName},\n\nYour transport for ${day.date.toDateString()} has been arranged:\nDriver: ${vehicleDriver.driverName} (${vehicleDriver.contactNumber})\nVehicle: ${vehicleDriver.vehicleNumber}\nPickup time: ${pickupTime}\n\n- Facilities Team`,
  });

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
      emailSentAt: new Date(),
    },
    create: {
      adHocRequestId,
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
      emailSentAt: new Date(),
    },
  });

  await prisma.adHocRequest.update({
    where: { id: adHocRequestId },
    data: { status: AdHocStatus.ASSIGNED },
  });

  await sendMail({
    to: request.employee.email,
    subject: "Your ad-hoc transport has been arranged",
    body: `Hi ${request.employee.fullName},\n\nYour ad-hoc transport for ${request.date.toDateString()} has been arranged:\nDriver: ${vehicleDriver.driverName} (${vehicleDriver.contactNumber})\nVehicle: ${vehicleDriver.vehicleNumber}\nPickup time: ${pickupTime}\n\n- Facilities Team`,
  });

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

  if (typeof vehicleDriverId !== "string" || !vehicleDriverId) {
    return { error: "Select a vehicle & driver." };
  }
  if (typeof pickupTime !== "string" || !pickupTime) {
    return { error: "Select a pickup time." };
  }

  try {
    if (typeof weeklyScheduleDayId === "string" && weeklyScheduleDayId) {
      await upsertAssignmentForWeeklyDay({
        weeklyScheduleDayId,
        vehicleDriverId,
        pickupTime,
        actor: session,
      });
      revalidatePath("/facilities/route-planning");
    } else if (typeof adHocRequestId === "string" && adHocRequestId) {
      await upsertAssignmentForAdHoc({
        adHocRequestId,
        vehicleDriverId,
        pickupTime,
        actor: session,
      });
      revalidatePath("/facilities/adhoc");
      revalidatePath("/operations/adhoc");
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
