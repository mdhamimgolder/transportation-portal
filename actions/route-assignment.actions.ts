"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { sendMail } from "@/lib/mailer";
import { trySendMail } from "@/lib/mailer";
import { transportArrangedEmail } from "@/lib/email-templates";
import { sanitizedActionError } from "@/lib/actions/action-error";
import { Role, AdHocStatus, WeeklyScheduleStatus } from "@/lib/constants/enums";
import type { SessionUser } from "@/lib/auth/session";

export type AssignRouteState = {
  error?: string;
  success?: boolean;
};

export type ResendEmailState = {
  error?: string;
  status?: "SENT" | "SKIPPED_DEV" | "FAILED";
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
  if (day.weeklySchedule.status !== WeeklyScheduleStatus.APPROVED) {
    throw new Error("This weekly schedule is not approved yet.");
  }
  if (!day.needsTransport) {
    throw new Error("The employee does not need transport on this day.");
  }

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

export async function resendRouteAssignmentEmail(
  _prevState: ResendEmailState,
  formData: FormData
): Promise<ResendEmailState> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const routeAssignmentId = formData.get("routeAssignmentId");
  if (typeof routeAssignmentId !== "string" || !routeAssignmentId) {
    return { error: "Missing assignment." };
  }

  try {
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
    const date =
      assignment.weeklyScheduleDay?.date ?? assignment.adHocRequest?.date;
    if (!employee || !date) return { error: "Assignment details are incomplete." };

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

    await prisma.$transaction([
      prisma.emailNotificationLog.create({
        data: {
          kind: "ROUTE_ASSIGNMENT_RESEND",
          recipient: employee.email,
          recipientName: employee.fullName,
          subject: email.subject,
          routeAssignmentId: assignment.id,
          status: outcome.status,
          error: outcome.error ?? null,
        },
      }),
      ...(outcome.status === "SENT"
        ? [
            prisma.routeAssignment.update({
              where: { id: assignment.id },
              data: { emailSentAt: new Date() },
              select: { id: true },
            }),
          ]
        : []),
    ]);

    revalidatePath("/facilities/route-planning");
    revalidatePath("/facilities/email-log");
    return { status: outcome.status, error: outcome.error };
  } catch (error) {
    return sanitizedActionError("resendRouteAssignmentEmail", error);
  }
}

export type SaveDaySheetState = {
  error?: string;
  savedCount?: number;
  skipped?: { employeeName: string; reason: string }[];
};

export type AutomatedPlannerState = {
  error?: string;
  weekLabel?: string;
  created?: number;
  updated?: number;
  skipped?: { employeeName: string; reason: string }[];
};

function arrivalWindow(arrivalTime: string | null): "pickup-point" | "home" | null {
  if (!arrivalTime) return null;
  const hour = Number(arrivalTime.split(":")[0]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (hour === 22) return "pickup-point";
  if (hour === 23 || hour <= 6) return "home";
  return null;
}

export async function runAutomatedRoutePlanner(
  previousState: AutomatedPlannerState,
  formData: FormData
): Promise<AutomatedPlannerState> {
  void previousState;
  void formData;
  const session = await requireRole([Role.FACILITIES]);
  const schedules = await prisma.weeklySchedule.findMany({
    where: { status: WeeklyScheduleStatus.APPROVED },
    orderBy: { weekStartDate: "desc" },
    include: {
      employee: { include: { homeAddress: true, pickupAddress: true } },
      days: { orderBy: { dayOfWeek: "asc" } },
    },
  });

  if (schedules.length === 0) return { error: "No approved weekly schedule is ready to plan." };
  const latestWeek = schedules[0].weekStartDate;
  const weekSchedules = schedules.filter(
    (schedule) => schedule.weekStartDate.getTime() === latestWeek.getTime()
  );

  const vehicles = await prisma.vehicleDriver.findMany({
    where: { isActive: true },
    orderBy: { vehicleNumber: "asc" },
  });
  if (vehicles.length === 0) {
    return { error: "Add at least one active vehicle and driver before planning." };
  }

  let created = 0;
  let updated = 0;
  const skipped: { employeeName: string; reason: string }[] = [];
  const emails: Promise<unknown>[] = [];

  for (const schedule of weekSchedules) for (const day of schedule.days) {
    if (!day.needsTransport) continue;
    const window = arrivalWindow(day.arrivalTime);
    const address = window === "pickup-point" ? schedule.employee.pickupAddress : schedule.employee.homeAddress;
    if (!window) {
      skipped.push({ employeeName: schedule.employee.fullName, reason: "Invalid arrival time." });
      continue;
    }
    if (!address) {
      skipped.push({
        employeeName: schedule.employee.fullName,
        reason: `Missing geocoded ${window === "pickup-point" ? "pick-up point" : "home address"}.`,
      });
      continue;
    }

    const existing = await prisma.routeAssignment.findUnique({
      where: { weeklyScheduleDayId: day.id },
    });
    const vehicle = vehicles[day.dayOfWeek % vehicles.length];
    const assignment = await prisma.routeAssignment.upsert({
      where: { weeklyScheduleDayId: day.id },
      update: {
        vehicleDriverId: vehicle.id,
        pickupTime: day.arrivalTime ?? "",
        assignedById: session.id,
        assignedAt: new Date(),
        emailSentAt: new Date(),
        vehicleType: window === "pickup-point" ? "4-seater" : "10-seater",
        pickupLat: address.latitude,
        pickupLng: address.longitude,
        pickupAddress: address.addressText,
      },
      create: {
        weeklyScheduleDayId: day.id,
        vehicleDriverId: vehicle.id,
        pickupTime: day.arrivalTime ?? "",
        assignedById: session.id,
        emailSentAt: new Date(),
        vehicleType: window === "pickup-point" ? "4-seater" : "10-seater",
        pickupLat: address.latitude,
        pickupLng: address.longitude,
        pickupAddress: address.addressText,
      },
    });

    if (existing) updated++;
    else created++;
    emails.push(
      sendMail({
        to: schedule.employee.email,
        subject: "Your transport has been arranged",
        body: `Hi ${schedule.employee.fullName},\n\nYour transport for ${day.date.toDateString()} has been arranged:\nPick-up point: ${address.addressText}\nCoordinates: ${address.latitude}, ${address.longitude}\nDriver: ${vehicle.driverName} (${vehicle.contactNumber})\nVehicle: ${vehicle.vehicleNumber} (${assignment.vehicleType})\nPickup time: ${assignment.pickupTime}\n\n- Facilities Team`,
      })
    );
  }

  await Promise.all(emails);
  revalidatePath("/facilities/automated-route-planner");
  revalidatePath("/facilities/route-planning");
  return {
    weekLabel: `Week of ${latestWeek.toLocaleDateString()}`,
    created,
    updated,
    skipped,
  };
}

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
