"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { sendMailBackground } from "@/lib/mailer";
import { arrivalMinutesForLabel } from "@/lib/constants/route-shifts";
import { officeCoordinatesFor } from "@/lib/constants/office-locations";
import { loadLearnedLegs, LEARN_MIN_SAMPLES } from "@/lib/routing/pickup-schedule";
import { backCalculatePickupMinutes } from "@/lib/routing/schedule-math";
import { haversineDistance, minutesToTimeString } from "@/lib/routing/utils";
import {
  learnRouteTemplateFromAssignments,
  mirrorRouteEditsAcrossWeek,
} from "@/lib/routing/route-pattern";

/**
 * Reassign an employee to a different vehicle
 */
export async function reassignEmployeeToVehicle(
  tripAssignmentId: string,
  newVehicleId: string,
  reason?: string
) {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    // Get current assignment
    const currentAssignment = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId },
      include: {
        routePlan: true,
        vehicle: true,
        employee: true,
      },
    });

    // Validate new vehicle exists and has capacity
    const newVehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: newVehicleId },
    });

    // Check capacity for the new vehicle on this route
    const currentCapacity = await prisma.tripAssignment.count({
      where: {
        routePlanId: currentAssignment.routePlanId,
        vehicleId: newVehicleId,
      },
    });

    // Max 5 for dynamic routes (11 PM+), no limit for 10 PM preset
    const isPreset = currentAssignment.routePlan.routeType === "PRESET_10PM";
    const maxCapacity = isPreset ? 999 : 5;

    if (currentCapacity >= maxCapacity) {
      throw new Error(
        `Vehicle ${newVehicle.vehicleNumber} is at capacity (${currentCapacity}/${maxCapacity})`
      );
    }

    // Save override audit
    const beforeState = {
      vehicleId: currentAssignment.vehicleId,
      pickupTime: currentAssignment.pickupTime,
      sequenceInTrip: currentAssignment.sequenceInTrip,
    };

    const afterState = {
      vehicleId: newVehicleId,
      pickupTime: currentAssignment.pickupTime,
      sequenceInTrip: currentCapacity + 1, // Will be the last in new vehicle
    };

    await prisma.routePlanOverride.create({
      data: {
        routePlanId: currentAssignment.routePlanId,
        changedById: session.id,
        changeType: "VEHICLE_REASSIGN",
        affectedEmployeeId: currentAssignment.employeeId,
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason,
      },
    });

    // Update assignment
    const updated = await prisma.tripAssignment.update({
      where: { id: tripAssignmentId },
      data: {
        vehicleId: newVehicleId,
        sequenceInTrip: currentCapacity + 1,
        manuallyOverridden: true,
      },
      include: {
        vehicle: true,
        employee: true,
        routePlan: true,
      },
    });

    // Propagate the new shape to the other draft days of this week.
    await mirrorRouteEditsAcrossWeek(currentAssignment.routePlanId);

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `${updated.employee.fullName} reassigned to ${updated.vehicle.vehicleNumber}`,
      assignment: updated,
    };
  } catch (error) {
    throw new Error(
      `Failed to reassign employee: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Adjust pickup time for an employee
 */
export async function adjustPickupTime(
  tripAssignmentId: string,
  newPickupTime: string,
  reason?: string
) {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const currentAssignment = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId },
      include: {
        routePlan: true,
        employee: true,
      },
    });

    // Only draft routes are the editable "working copy" — finalized schedules
    // are locked once Facilities commits them (finalize sends the emails).
    if (
      currentAssignment.routePlan.status !== "DRAFT" &&
      currentAssignment.routePlan.status !== "UNDER_REVIEW"
    ) {
      throw new Error(
        `This route is ${currentAssignment.routePlan.status}. Only draft routes can have pick-up times edited.`
      );
    }

    // Validate time format ("9:05" and "21:05" both accepted; stored "HH:mm").
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(newPickupTime.trim());
    if (!timeMatch) {
      throw new Error("Invalid time format. Use HH:mm (e.g. 21:05)");
    }
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (hours > 23 || minutes > 59) {
      throw new Error("Invalid time format. Use HH:mm (e.g. 21:05)");
    }
    const pickupTime = `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}`;

    const beforeState = {
      pickupTime: currentAssignment.pickupTime,
    };

    const afterState = {
      pickupTime,
    };

    await prisma.routePlanOverride.create({
      data: {
        routePlanId: currentAssignment.routePlanId,
        changedById: session.id,
        changeType: "PICKUP_TIME_ADJUST",
        affectedEmployeeId: currentAssignment.employeeId,
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason,
      },
    });

    const updated = await prisma.tripAssignment.update({
      where: { id: tripAssignmentId },
      data: {
        pickupTime,
        manuallyOverridden: true,
        emailSentAt: null, // Need to resend email with new time
      },
      include: {
        vehicle: true,
        employee: true,
        routePlan: true,
      },
    });

    // Push the new pick-up time to the same vehicle's other draft days of the
    // week (Tue-Fri follow Monday instantly — no re-mapping).
    await mirrorRouteEditsAcrossWeek(currentAssignment.routePlanId);

    revalidatePath("/facilities/route-planning");
    revalidatePath("/facilities/automated-route-planner");

    return {
      success: true,
      message: `Pickup time updated for ${updated.employee.fullName} to ${pickupTime}`,
      assignment: updated,
    };
  } catch (error) {
    throw new Error(
      `Failed to adjust pickup time: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Swap two employees between vehicles
 */
export async function swapEmployees(
  tripAssignmentId1: string,
  tripAssignmentId2: string,
  reason?: string
) {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const assignment1 = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId1 },
      include: { employee: true, vehicle: true, routePlan: true },
    });

    const assignment2 = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId2 },
      include: { employee: true, vehicle: true, routePlan: true },
    });

    // Can only swap within same route
    if (assignment1.routePlanId !== assignment2.routePlanId) {
      throw new Error("Can only swap employees within the same route");
    }

    const beforeState = {
      emp1: { vehicleId: assignment1.vehicleId, time: assignment1.pickupTime },
      emp2: { vehicleId: assignment2.vehicleId, time: assignment2.pickupTime },
    };

    const afterState = {
      emp1: { vehicleId: assignment2.vehicleId, time: assignment2.pickupTime },
      emp2: { vehicleId: assignment1.vehicleId, time: assignment1.pickupTime },
    };

    await prisma.routePlanOverride.create({
      data: {
        routePlanId: assignment1.routePlanId,
        changedById: session.id,
        changeType: "EMPLOYEE_SWAP",
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason,
      },
    });

    // Swap
    await prisma.tripAssignment.updateMany({
      where: {
        id: { in: [tripAssignmentId1, tripAssignmentId2] },
      },
      data: {
        manuallyOverridden: true,
        emailSentAt: null,
      },
    });

    await prisma.tripAssignment.update({
      where: { id: tripAssignmentId1 },
      data: {
        vehicleId: assignment2.vehicleId,
        pickupTime: assignment2.pickupTime,
      },
    });

    await prisma.tripAssignment.update({
      where: { id: tripAssignmentId2 },
      data: {
        vehicleId: assignment1.vehicleId,
        pickupTime: assignment1.pickupTime,
      },
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `${assignment1.employee.fullName} and ${assignment2.employee.fullName} swapped vehicles`,
    };
  } catch (error) {
    throw new Error(
      `Failed to swap employees: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Finalize a route and send emails to employees
 */
export async function finalizeRoute(routePlanId: string) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const routePlan = await prisma.routePlan.findUniqueOrThrow({
      where: { id: routePlanId },
      include: {
        vehicle: true,
        tripAssignments: {
          include: {
            employee: true,
            pickupAddress: true,
            pickupPoint: { include: { address: true } },
          },
        },
      },
    });

    // Mark route as finalized immediately
    const updated = await prisma.routePlan.update({
      where: { id: routePlanId },
      data: {
        status: "FINALIZED",
        finalizedAt: new Date(),
      },
    });

    // Learn the tuned route (stop order + pickup times) as this vehicle's
    // pattern for this arrival time — the next week's RUN MAPPING replays it.
    await learnRouteTemplateFromAssignments({
      vehicleId: routePlan.vehicleId,
      arrivalTime: routePlan.arrivalTime,
      office: routePlan.officeLocation,
      sourcePlanId: routePlanId,
      assignments: routePlan.tripAssignments,
    });

    // Better late than never at week start: if Facilities finalizes one day's
    // route first, the other draft days follow the finalized pattern.
    await mirrorRouteEditsAcrossWeek(routePlanId);

    // Send emails in background after response
    after(async () => {
      const results = await Promise.allSettled(
        routePlan.tripAssignments.map((assignment) => {
          const pickupLocation =
            assignment.pickupType === "PRESET_POINT" && assignment.pickupPoint
              ? assignment.pickupPoint.address?.addressText || "Pickup Point"
              : assignment.pickupAddress?.addressText || "Home Address";

          return sendMailBackground({
            to: assignment.employee.email,
            subject: `Your transport has been arranged - ${routePlan.arrivalTime}`,
            body: `Hi ${assignment.employee.fullName},

Your transport for ${routePlan.dayDate.toDateString()} has been arranged:

Arrival Time: ${routePlan.arrivalTime}
Pickup Time: ${assignment.pickupTime}
Pickup Location: ${pickupLocation}
Vehicle: ${routePlan.vehicle.vehicleNumber} (${routePlan.vehicle.vehicleType})
Driver: ${routePlan.vehicle.driverName || "TBD"}
Driver Contact: ${routePlan.vehicle.driverContact || "N/A"}

Please be ready at the pickup location at the scheduled time.

Best regards,
Facilities Team`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a2e;">Your Transport Has Been Arranged</h2>
                <p>Hi <strong>${assignment.employee.fullName}</strong>,</p>
                <p>Your transport for <strong>${routePlan.dayDate.toDateString()}</strong> has been arranged with the following details:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Arrival Time</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.arrivalTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Pickup Time</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${assignment.pickupTime}</td>
                  </tr>
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Pickup Location</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${pickupLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Vehicle</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.vehicle.vehicleNumber} (${routePlan.vehicle.vehicleType})</td>
                  </tr>
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Driver</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.vehicle.driverName || "TBD"}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Driver Contact</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.vehicle.driverContact || "N/A"}</td>
                  </tr>
                </table>
                <p>Please be ready at the pickup location at the scheduled time.</p>
                <p style="color: #6c757d; margin-top: 24px;">Best regards,<br><strong>Facilities Team</strong></p>
              </div>
            `,
          });
        })
      );

      const sentCount = results.filter((r) => r.status === "fulfilled").length;
      if (sentCount > 0) {
        await prisma.tripAssignment.updateMany({
          where: { routePlanId },
          data: { emailSentAt: new Date() },
        });
      }
      console.log(
        `[MAILER] Finalized route ${routePlanId}: ${sentCount}/${routePlan.tripAssignments.length} emails sent`
      );
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `Route finalized. Emails sending to ${routePlan.tripAssignments.length} employees.`,
      route: updated,
    };
  } catch (error) {
    throw new Error(
      `Failed to finalize route: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Reject/cancel a draft route
 */
export async function cancelRoute(routePlanId: string, reason?: string) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
    void reason;

    const routePlan = await prisma.routePlan.findUniqueOrThrow({
      where: { id: routePlanId },
      include: { vehicle: { select: { vehicleNumber: true } } },
    });

    if (routePlan.status !== "DRAFT" && routePlan.status !== "UNDER_REVIEW") {
      throw new Error(
        `Cannot cancel route with status ${routePlan.status}. Only DRAFT or UNDER_REVIEW routes can be cancelled.`
      );
    }

    // Delete all trip assignments for this route
    await prisma.tripAssignment.deleteMany({
      where: { routePlanId },
    });

    // Delete the route plan
    await prisma.routePlan.delete({
      where: { id: routePlanId },
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `Route cancelled: ${routePlan.vehicle.vehicleNumber || routePlan.id}`,
    };
  } catch (error) {
    throw new Error(
      `Failed to cancel route: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get route details with all assignments
 */
export async function getRouteDetails(routePlanId: string) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const route = await prisma.routePlan.findUniqueOrThrow({
      where: { id: routePlanId },
      include: {
        vehicle: true,
        tripAssignments: {
          include: {
            employee: true,
            pickupAddress: true,
            pickupPoint: {
              include: { address: true },
            },
          },
          orderBy: { sequenceInTrip: "asc" },
        },
        overrides: {
          orderBy: { createdAt: "desc" },
        },
        previousRoutePlan: {
          include: { vehicle: true },
        },
      },
    });

    return route;
  } catch (error) {
    throw new Error(
      `Failed to fetch route details: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ── Route-sheet interactions (Generated routes breakdown) ───────────────────
// Drag rows to reorder within a vehicle, drag onto another vehicle card to
// move an employee between routes, and edit pickup times inline. Every change
// re-times the affected route(s) from the learned pickup-gap set (with the
// 5 min/km fallback) so the arrival window still holds.

type LearnedLegRow = {
  avgMinutes: number;
  sampleCount: number;
  min: number;
  max: number;
};

type TimingPoint = {
  tripId: string;
  lat: number | null;
  lng: number | null;
  key: string | null;
};

/** "10 PM" → "10PM", "11 PM" → "11PM", anything else → "12AM-6AM". */
function shiftKeyForLabel(label: string): string {
  const norm = (label ?? "").toUpperCase().replace(/\s+/g, "");
  if (norm === "10PM") return "10PM";
  if (norm === "11PM") return "11PM";
  return "12AM-6AM";
}

/** Drive minutes for one leg: learned median once it has >= 3 observations,
 * otherwise straight-line km × 5 (the city-speed rule). */
function legDriveMinutes(
  a: TimingPoint,
  b: TimingPoint,
  learned: Map<string, LearnedLegRow>
): number {
  if (a.key && b.key) {
    const entry = learned.get(`${a.key}->${b.key}`);
    if (
      entry &&
      entry.sampleCount >= LEARN_MIN_SAMPLES &&
      Number.isFinite(entry.avgMinutes) &&
      entry.avgMinutes > 0
    ) {
      return Math.max(1, Math.round(entry.avgMinutes));
    }
  }
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    return Math.max(
      1,
      Math.ceil(haversineDistance(a.lat, a.lng, b.lat, b.lng) * 5)
    );
  }
  return 5;
}

/**
 * Recompute sequence + pickup times for a route from its current trip order.
 * Legs: learned average if trusted, else distance × 5; times back-calculated
 * from the route's arrival window on the 5-minute grid. Emails are invalidated
 * (a re-finalize re-sends). Returns an error message, or null on success.
 */
async function retimeRoute(routePlanId: string): Promise<string | null> {
  const plan = await prisma.routePlan.findUniqueOrThrow({
    where: { id: routePlanId },
    include: {
      tripAssignments: {
        include: {
          pickupAddress: true,
          pickupPoint: { include: { address: true } },
        },
      },
    },
  });
  const trips = [...plan.tripAssignments].sort(
    (a, b) => a.sequenceInTrip - b.sequenceInTrip
  );
  if (trips.length === 0) return null;

  const arrivalMinutes = arrivalMinutesForLabel(plan.arrivalTime);
  if (arrivalMinutes == null) {
    return `Unknown arrival label "${plan.arrivalTime}".`;
  }
  const learned = await loadLearnedLegs(shiftKeyForLabel(plan.arrivalTime));

  const points = trips.map((t) => {
    const address =
      t.pickupType === "PRESET_POINT"
        ? t.pickupPoint?.address
        : t.pickupAddress;
    return {
      tripId: t.id,
      lat: address?.latitude ?? null,
      lng: address?.longitude ?? null,
      key: address ? `addr:${address.id}` : null,
    } satisfies TimingPoint;
  });
  const officeName = plan.officeLocation ?? "Regnum";
  const office = officeCoordinatesFor(officeName);

  // Leg i = stop i -> stop i+1; the last leg = last stop -> office.
  const legs: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const next =
      i < points.length - 1
        ? points[i + 1]
        : {
            tripId: "__office__",
            lat: office.lat,
            lng: office.lng,
            key: `office:${officeName}`,
          };
    legs.push(legDriveMinutes(points[i], next, learned));
  }

  let pickupMinutes: number[];
  try {
    pickupMinutes = backCalculatePickupMinutes(arrivalMinutes, legs);
  } catch {
    const total = legs.reduce((a, b) => a + b, 0);
    return `This order takes ${total} min — longer than the ${plan.arrivalTime} window allows.`;
  }

  await prisma.$transaction(
    trips.map((t, i) =>
      prisma.tripAssignment.update({
        where: { id: t.id },
        data: {
          sequenceInTrip: i + 1,
          pickupTime: minutesToTimeString(pickupMinutes[i]),
          emailSentAt: null,
        },
      })
    )
  );
  return null;
}

/**
 * Reorder the trips of one route (spreadsheet row drag within a vehicle).
 * `orderedTripIds` must be a permutation of the route's current trip ids.
 * Audited as a ROUTE_REORDERED override and re-timed from the arrival.
 */
export async function reorderRouteTrips(
  routePlanId: string,
  orderedTripIds: string[]
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
    const plan = await prisma.routePlan.findUnique({
      where: { id: routePlanId },
      include: { tripAssignments: { select: { id: true } } },
    });
    if (!plan) return { success: false, error: "Route not found." };
    if (plan.status !== "DRAFT" && plan.status !== "UNDER_REVIEW") {
      return {
        success: false,
        error: `This route is ${plan.status}. Only draft routes can be reordered.`,
      };
    }
    const currentIds = plan.tripAssignments.map((t) => t.id);
    const sameSet =
      currentIds.length === orderedTripIds.length &&
      new Set(orderedTripIds).size === orderedTripIds.length &&
      currentIds.every((id) => orderedTripIds.includes(id));
    if (!sameSet) {
      return {
        success: false,
        error: "The row list does not match this route's employees.",
      };
    }

    const before = currentIds.map((id) => ({ tripId: id }));
    await prisma.$transaction(
      orderedTripIds.map((id, i) =>
        prisma.tripAssignment.update({
          where: { id },
          data: { sequenceInTrip: i + 1, manuallyOverridden: true },
        })
      )
    );

    await prisma.routePlanOverride.create({
      data: {
        routePlanId,
        changedById: session.id,
        changeType: "ROUTE_REORDERED",
        beforeState: JSON.stringify({ order: before }),
        afterState: JSON.stringify({ order: orderedTripIds }),
        reason: "Reordered from the generated-routes breakdown.",
      },
    });

    const retimeError = await retimeRoute(routePlanId);
    if (retimeError) return { success: false, error: retimeError };

    // The tuned order is the working pattern for the week: reflect it onto the
    // same vehicle + arrival time on the other draft days.
    await mirrorRouteEditsAcrossWeek(routePlanId);

    revalidatePath("/facilities/automated-route-planner");
    revalidatePath("/facilities/route-planning");
    return {
      success: true,
      message: "Row order updated and pickup times recalculated.",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reorder the route rows.",
    };
  }
}

/**
 * Move an employee from one generated route to another (drag onto another
 * vehicle's card). Only routes of the same day and same arrival window can be
 * targets, so the employee's arrival time never silently changes. Both the
 * source and the target are re-timed and their riders re-sequenced.
 */
export async function moveTripToRoute(
  tripAssignmentId: string,
  targetRoutePlanId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const trip = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId },
      include: { routePlan: { include: { vehicle: true } }, employee: true },
    });
    const target = await prisma.routePlan.findUniqueOrThrow({
      where: { id: targetRoutePlanId },
      include: { vehicle: true, tripAssignments: { select: { id: true } } },
    });

    if (trip.routePlanId === targetRoutePlanId) {
      return { success: false, error: "That row already rides this vehicle." };
    }
    if (
      (trip.routePlan.status !== "DRAFT" &&
        trip.routePlan.status !== "UNDER_REVIEW") ||
      (target.status !== "DRAFT" && target.status !== "UNDER_REVIEW")
    ) {
      return {
        success: false,
        error:
          "Only draft routes can be changed. Finalize commits the schedule — re-run mapping to start a fresh draft.",
      };
    }
    if (trip.routePlan.dayDate.getTime() !== target.dayDate.getTime()) {
      return { success: false, error: "Rows can only be moved within the same day." };
    }
    if (trip.routePlan.arrivalTime !== target.arrivalTime) {
      return {
        success: false,
        error: `This vehicle runs the ${trip.routePlan.arrivalTime} shift — drop it on a ${trip.routePlan.arrivalTime} vehicle.`,
      };
    }

    const isPreset = target.routeType === "PRESET_10PM";
    const capacityLimit = isPreset
      ? target.vehicle.capacity ?? 999
      : Math.min(4, target.vehicle.capacity ?? 4);
    if (target.tripAssignments.length >= capacityLimit) {
      return {
        success: false,
        error: `Vehicle ${target.vehicle.vehicleNumber} is full (${target.tripAssignments.length}/${capacityLimit}).`,
      };
    }

    const beforeState = {
      routePlanId: trip.routePlanId,
      vehicleId: trip.routePlan.vehicleId,
      pickupTime: trip.pickupTime,
      sequenceInTrip: trip.sequenceInTrip,
    };
    const afterState = {
      routePlanId: targetRoutePlanId,
      vehicleId: target.vehicleId,
    };

    await prisma.routePlanOverride.create({
      data: {
        routePlanId: trip.routePlanId,
        changedById: session.id,
        changeType: "VEHICLE_REASSIGN",
        affectedEmployeeId: trip.employeeId,
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason: "Moved between vehicles from the generated-routes breakdown.",
      },
    });

    await prisma.tripAssignment.update({
      where: { id: tripAssignmentId },
      data: {
        routePlanId: targetRoutePlanId,
        vehicleId: target.vehicleId,
        manuallyOverridden: true,
        emailSentAt: null,
      },
    });

    const sourceError = await retimeRoute(trip.routePlanId);
    const targetError = await retimeRoute(targetRoutePlanId);
    const errors = [sourceError, targetError].filter(
      (e) => e != null
    ) as string[];
    if (errors.length > 0) {
      return { success: false, error: errors.join(" ") };
    }

    // Both routes changed shape — propagate each pattern to its own other
    // draft days of the week.
    await mirrorRouteEditsAcrossWeek(trip.routePlanId);
    await mirrorRouteEditsAcrossWeek(targetRoutePlanId);

    revalidatePath("/facilities/automated-route-planner");
    revalidatePath("/facilities/route-planning");
    return {
      success: true,
      message: `${trip.employee.fullName} moved to ${target.vehicle.vehicleNumber} — both routes re-timed.`,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to move the employee.",
    };
  }
}
