"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { sendMail, trySendMail } from "@/lib/mailer";
import { logActionError, sanitizedActionError } from "@/lib/actions/action-error";
import { Role } from "@/lib/constants/enums";
import type { SessionUser } from "@/lib/auth/session";
import { auditEntry } from "@/lib/audit";

export type SaveFixedArrivalListState = {
  error?: string;
  savedCount?: number;
  skipped?: { employeeName: string; reason: string }[];
};

/**
 * Facilities saves the STATIC pick-up details for fixed-arrival employees
 * from the "Corporate Fixed arrival" list on the Pick-up schedule page.
 * One record per employee, week-independent: it stays in force until
 * Facilities saves new details. Arrival time and the transport ON/OFF
 * toggle are NOT handled here — those go through
 * `updateFixedArrivalServiceAction` (Facilities-profile actions).
 */
export async function saveFixedArrivalPickups(
  _prevState: SaveFixedArrivalListState,
  formData: FormData
): Promise<SaveFixedArrivalListState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const employeeIds = formData.getAll("employeeId").map(String);
  const employeeNames = formData.getAll("employeeName").map(String);
  const pickupTimes = formData.getAll("pickupTime").map(String);
  const vehicleNumbers = formData.getAll("vehicleNumber").map(String);

  if (employeeIds.length === 0) {
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

  for (let i = 0; i < employeeIds.length; i++) {
    const employeeId = employeeIds[i];
    const pickupTime = pickupTimes[i]?.trim() ?? "";
    const vehicleNumber = vehicleNumbers[i]?.trim() ?? "";
    const employeeName = employeeNames[i] ?? "Unknown employee";

    // Neither field was touched for this row — leave any existing static
    // details alone (persist until Facilities changes them).
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
      await upsertFixedArrivalPickup({
        employeeId,
        vehicleDriverId: vehicleDriver.id,
        pickupTime,
        actor: session,
      });
      savedCount++;
    } catch (error) {
      logActionError("saveFixedArrivalPickups", error);
      skipped.push({
        employeeName,
        reason: "Could not save this row.",
      });
    }
  }

  revalidatePath("/facilities/route-planning");
  revalidatePath("/facilities/email-log");
  return { savedCount, skipped };
}

async function upsertFixedArrivalPickup(params: {
  employeeId: string;
  vehicleDriverId: string;
  pickupTime: string;
  actor: SessionUser;
}) {
  const { employeeId, vehicleDriverId, pickupTime, actor } = params;

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      fixedArrivalPickup: {
        select: { id: true, vehicleDriverId: true, pickupTime: true },
      },
    },
  });
  if (!employee || employee.role !== Role.FIXED_ARRIVAL) {
    throw new Error("Fixed-arrival employee not found.");
  }
  const vehicleDriver = await prisma.vehicleDriver.findUnique({
    where: { id: vehicleDriverId },
  });
  if (!vehicleDriver) throw new Error("Select a valid vehicle & driver.");

  const record = await prisma.fixedArrivalPickup.upsert({
    where: { employeeId },
    update: {
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
      emailSentAt: new Date(),
    },
    create: {
      employeeId,
      vehicleDriverId,
      pickupTime,
      assignedById: actor.id,
      emailSentAt: new Date(),
    },
  });

  await auditEntry(actor, {
    action: "UPDATE_FIXED_ARRIVAL_PICKUP",
    entityType: "FixedArrivalPickup",
    entityId: record.id,
    before: employee.fixedArrivalPickup
      ? {
          vehicleDriverId: employee.fixedArrivalPickup.vehicleDriverId,
          pickupTime: employee.fixedArrivalPickup.pickupTime,
        }
      : null,
    after: { vehicleDriverId, pickupTime },
    description: `${actor.fullName} saved the standing pick-up details for ${employee.fullName}`,
  });

  await sendMail({
    to: employee.email,
    subject: "Your transport details have been saved",
    body: `Hi ${employee.fullName},\n\nYour standing transport details have been arranged:\nDriver: ${vehicleDriver.driverName} (${vehicleDriver.contactNumber})\nVehicle: ${vehicleDriver.vehicleNumber}\nPickup time: ${pickupTime}\n\nThese details stay in force until Facilities updates them.\n\n- Facilities Team`,
  });

  return record;
}

/**
 * Re-send the standing transport details email for one fixed-arrival
 * employee (delivery is logged in EmailNotificationLog; no link to a
 * RouteAssignment, which this list does not use).
 */
export async function resendFixedArrivalPickupEmail(
  userId: string
): Promise<{ error?: string }> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {

    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        fixedArrivalPickup: {
          include: {
            vehicleDriver: true,
          },
        },
      },
    });
    if (!employee || employee.role !== Role.FIXED_ARRIVAL || !employee.fixedArrivalPickup) {
      return { error: "No saved pick-up details for this employee." };
    }
    const { pickupTime, vehicleDriver } = employee.fixedArrivalPickup;

    const subject = "Your transport details have been saved";
    const outcome = await trySendMail({
      to: employee.email,
      subject,
      body: `Hi ${employee.fullName},\n\nYour standing transport details have been arranged:\nDriver: ${vehicleDriver.driverName} (${vehicleDriver.contactNumber})\nVehicle: ${vehicleDriver.vehicleNumber}\nPickup time: ${pickupTime}\n\nThese details stay in force until Facilities updates them.\n\n- Facilities Team`,
    });

    await prisma.emailNotificationLog.create({
      data: {
        kind: "ROUTE_ASSIGNMENT_FIXED_ARRIVAL",
        recipient: employee.email,
        recipientName: employee.fullName,
        subject,
        routeAssignmentId: null,
        status: outcome.status,
        error: outcome.error ?? null,
      },
    });

    revalidatePath("/facilities/route-planning");
    revalidatePath("/facilities/email-log");
    await auditEntry(session, {
      action: "RESEND_FIXED_ARRIVAL_PICKUP_EMAIL",
      entityType: "FixedArrivalPickup",
      entityId: employee.fixedArrivalPickup.id,
      after: { status: outcome.status },
      description: `${session.fullName} re-sent the standing transport details email to ${employee.fullName}`,
    });
    return outcome.error ? { error: "The email could not be sent." } : {};
  } catch (error) {
    return sanitizedActionError("resendFixedArrivalPickupEmail", error);
  }
}
