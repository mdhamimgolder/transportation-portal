"use server";

import { escapeHtml } from "@/lib/html";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { trySendMail } from "@/lib/mailer";
import { arrivalMinutesForLabel } from "@/lib/constants/route-shifts";
import { officeCoordinatesFor } from "@/lib/constants/office-locations";
import { ensurePickupPointSchedule, loadLearnedLegs, LEARN_MIN_SAMPLES } from "@/lib/routing/pickup-schedule";
import { backCalculatePickupMinutes } from "@/lib/routing/schedule-math";
import { minutesToTimeString } from "@/lib/routing/utils";
import { toUtcMidnight } from "@/lib/date/week";
import {
  learnRouteTemplateFromAssignments,
  mirrorRouteEditsAcrossWeek,
} from "@/lib/routing/route-pattern";
import { DYNAMIC_GROUP_CAPACITY, errorMessage } from "@/lib/routing/corridor-core";
import {
  sanitizedActionMessage,
  throwSanitizedError,
} from "@/lib/actions/action-error";

/**
 * Adjust pickup time for an employee
 */
export async function adjustPickupTime(
  tripAssignmentId: string,
  newPickupTime: string,
  reason?: string
) {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
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
    // week (Tue-Fri follow Monday instantly — no re-mapping). Runs AFTER the
    // response so the pick-up time save returns immediately.
    after(async () => {
      try {
        await mirrorRouteEditsAcrossWeek(currentAssignment.routePlanId);
      } catch (error) {
        console.error(
          `[MIRROR] Failed to mirror pickup-time edit for ${currentAssignment.routePlanId}: ${errorMessage(error)}`
        );
      }
    });

    revalidatePath("/facilities/route-planning");
    revalidatePath("/facilities/automated-route-planner");

    return {
      success: true,
      message: `Pickup time updated for ${updated.employee.fullName} to ${pickupTime}`,
      assignment: {
        id: updated.id,
        pickupTime: updated.pickupTime,
        routePlan: { id: updated.routePlan.id },
      },
    };
  } catch (error) {
    throwSanitizedError(
      "adjustPickupTime",
      error,
      "Failed to adjust pickup time."
    );
  }
}

/**
 * Finalize a route and send emails to employees
 */
export async function finalizeRoute(routePlanId: string) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
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

    // The heavy consistency work runs AFTER the response is sent so Facilities
    // never waits for the save: learning this vehicle's template for next
    // week's mapping + mirroring onto the other draft days are best-effort.
    after(async () => {
      try {
        await learnRouteTemplateFromAssignments({
          vehicleId: routePlan.vehicleId,
          arrivalTime: routePlan.arrivalTime,
          office: routePlan.officeLocation,
          sourcePlanId: routePlanId,
          assignments: routePlan.tripAssignments,
        });
      } catch (error) {
        console.error(
          `[LEARN] Failed to learn template for ${routePlanId}: ${errorMessage(error)}`
        );
      }

      try {
        await mirrorRouteEditsAcrossWeek(routePlanId);
      } catch (error) {
        console.error(
          `[MIRROR] Failed to mirror finalized route ${routePlanId}: ${errorMessage(error)}`
        );
      }
    });

    // Send emails in background after response
    after(async () => {
      const results = await Promise.all(
        routePlan.tripAssignments.map(async (assignment) => {
          const pickupLocation =
            assignment.pickupType === "PRESET_POINT" && assignment.pickupPoint
              ? assignment.pickupPoint.address?.addressText || "Pickup Point"
              : assignment.pickupAddress?.addressText || "Home Address";

          const subject = `Your transport has been arranged - ${routePlan.arrivalTime}`;
          const result = await trySendMail({
            to: assignment.employee.email,
            subject,
            body: `Hi ${assignment.employee.fullName},

Your transport for ${routePlan.dayDate.toDateString()} has been arranged:

Arrival Time: ${routePlan.arrivalTime}
Pickup Time: ${assignment.pickupTime}
Pickup Location: ${pickupLocation}
Vehicle: ${escapeHtml(routePlan.vehicle.vehicleNumber)} (${escapeHtml(routePlan.vehicle.vehicleType)})
Driver: ${routePlan.vehicle.driverName || "TBD"}
Driver Contact: ${routePlan.vehicle.driverContact || "N/A"}

Please be ready at the pickup location at the scheduled time.

Best regards,
Facilities Team`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a2e;">Your Transport Has Been Arranged</h2>
                <p>Hi <strong>${escapeHtml(assignment.employee.fullName)}</strong>,</p>
                <p>Your transport for <strong>${routePlan.dayDate.toDateString()}</strong> has been arranged with the following details:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Arrival Time</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(routePlan.arrivalTime)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Pickup Time</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(assignment.pickupTime)}</td>
                  </tr>
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Pickup Location</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(pickupLocation)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Vehicle</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(routePlan.vehicle.vehicleNumber)} (${escapeHtml(routePlan.vehicle.vehicleType)})</td>
                  </tr>
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Driver</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(routePlan.vehicle.driverName || "TBD")}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Driver Contact</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(routePlan.vehicle.driverContact || "N/A")}</td>
                  </tr>
                </table>
                <p>Please be ready at the pickup location at the scheduled time.</p>
                <p style="color: #6c757d; margin-top: 24px;">Best regards,<br><strong>Facilities Team</strong></p>
              </div>
            `,
          });
          return {
            assignmentId: assignment.id,
            recipient: assignment.employee.email,
            recipientName: assignment.employee.fullName,
            subject,
            ...result,
          };
        })
      );

      const sentIds = results
        .filter((result) => result.status === "SENT")
        .map((result) => result.assignmentId);
      if (sentIds.length > 0) {
        await prisma.tripAssignment.updateMany({
          where: { id: { in: sentIds } },
          data: { emailSentAt: new Date() },
        });
      }
      if (results.length > 0) {
        await prisma.emailNotificationLog.createMany({
          data: results.map((result) => ({
            kind: "ROUTE_PLAN_FINALIZE",
            recipient: result.recipient,
            recipientName: result.recipientName,
            subject: result.subject,
            status: result.status,
            error: result.error ?? null,
            routeAssignmentId: result.assignmentId,
          })),
        });
      }
      const sentCount = sentIds.length;
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
    throwSanitizedError("finalizeRoute", error, "Failed to finalize route.");
  }
}

// ── Route-sheet interactions (Generated routes breakdown) ───────────────────
// Drag rows to reorder within a vehicle, drag onto another vehicle card to
// move an employee between routes, and edit pickup times inline. Every change
// re-times the affected route(s) from the trained pickup-gap set (see
// RouteLegLearning) so the arrival window still holds. There is NO 5 min/km
// fallback: a leg that was never finalized or taught errors the retime with
// the missing pairs named.

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

/**
 * Large draft routes (e.g. the 10 PM preset with every seat filled) can push a
 * batch transaction past Prisma's 5 s default. Retiming + moving + week-mirror
 * all commit whole routes, so give them room.
 */
const BATCH_TX_OPTIONS =
  { maxWait: 30000, timeout: 90000 } as const;

/** "10 PM" → "10PM", "11 PM" → "11PM", anything else → "12AM-6AM". */
function shiftKeyForLabel(label: string): string {
  const norm = (label ?? "").toUpperCase().replace(/\s+/g, "");
  if (norm === "10PM") return "10PM";
  if (norm === "11PM") return "11PM";
  return "12AM-6AM";
}

/** Active pickup points of one vehicle, in preset sequence order. */
type PresetPointRef = {
  id: string;
  sequence: number;
  addressId: string;
  name: string;
};

/**
 * The vehicle's PRESET sequence position for a trip: the point's own sequence
 * when the trip's point belongs to this vehicle, else resolved onto this
 * vehicle's active points by address, then by case-insensitive name (the same
 * fallbacks the 10 PM generator uses). Null = not part of the preset sequence.
 */
function resolvePresetSequence(
  trip: {
    pickupType: string;
    pickupPoint: {
      id: string;
      sequence: number;
      name: string;
      addressId: string | null;
    } | null;
  },
  vehiclePoints: PresetPointRef[]
): number | null {
  if (trip.pickupType !== "PRESET_POINT" || !trip.pickupPoint) return null;
  const point = trip.pickupPoint;
  const byId = vehiclePoints.find((p) => p.id === point.id);
  if (byId) return byId.sequence;
  if (point.addressId) {
    const byAddress = vehiclePoints.find((p) => p.addressId === point.addressId);
    if (byAddress) return byAddress.sequence;
  }
  const name = point.name?.trim().toLowerCase();
  if (name) {
    const byName = vehiclePoints.find(
      (p) => p.name.trim().toLowerCase() === name
    );
    if (byName) return byName.sequence;
  }
  return null;
}

/**
 * Insert index for a rider moved onto a PRESET route: before the first stop
 * whose preset sequence is greater than the rider's own (same-point riders
 * stay grouped). Riders without a preset point on this vehicle append at the
 * end — they are an extra stop, not part of the configured sequence.
 */
function presetInsertIndex(
  existingTrips: Array<{
    pickupType: string;
    pickupPoint: {
      id: string;
      sequence: number;
      name: string;
      addressId: string | null;
    } | null;
  }>,
  movedTrip: {
    pickupType: string;
    pickupPoint: {
      id: string;
      sequence: number;
      name: string;
      addressId: string | null;
    } | null;
  },
  vehiclePoints: PresetPointRef[]
): number {
  const movedSeq = resolvePresetSequence(movedTrip, vehiclePoints);
  if (movedSeq == null) return existingTrips.length;
  const idx = existingTrips.findIndex((t) => {
    const seq = resolvePresetSequence(t, vehiclePoints);
    return seq != null && seq > movedSeq;
  });
  return idx === -1 ? existingTrips.length : idx;
}

/**
 * Canonical pickup-point id for a trip on a vehicle: the point itself when it
 * belongs to this vehicle, else resolved by address, then by case-insensitive
 * name (the same fallbacks the 10 PM generator uses). Null = not part of this
 * vehicle's pickup-point schedule (an extra stop).
 */
function resolveCanonicalPointId(
  trip: {
    pickupType: string;
    pickupPoint: {
      id: string;
      name: string | null;
      addressId: string | null;
    } | null;
  },
  points: Array<{ id: string; addressId: string; name: string }>
): string | null {
  if (trip.pickupType !== "PRESET_POINT" || !trip.pickupPoint) return null;
  const point = trip.pickupPoint;
  if (points.some((p) => p.id === point.id)) return point.id;
  if (point.addressId) {
    const byAddress = points.find((p) => p.addressId === point.addressId);
    if (byAddress) return byAddress.id;
  }
  const name = point.name?.trim().toLowerCase();
  if (name) {
    const byName = points.find((p) => p.name.trim().toLowerCase() === name);
    if (byName) return byName.id;
  }
  return null;
}

/**
 * Compute the per-trip { sequence, pickupTime } writes for a PROSPECTIVE trip
 * order WITHOUT touching the database. Returns an error string instead of
 * throwing when the order can't fit its arrival window, so callers can reject
 * the mutation before anything is committed (avoids partial re-times).
 */
async function buildRetimeUpdates(
  arrivalTime: string,
  officeLocation: string | null,
  trips: {
    id: string;
    pickupType: string;
    pickupPoint: {
      id: string;
      name: string | null;
      addressId: string | null;
      address: { id: string; latitude: number | null; longitude: number | null } | null;
    } | null;
    pickupAddress: { id: string; latitude: number | null; longitude: number | null } | null;
  }[],
  preset?: { routeType: string | null; vehicleId: string }
): Promise<{
  updates: NonNullable<Parameters<typeof prisma.tripAssignment.update>[0]>[];
  error?: string;
}> {
  if (trips.length === 0) return { updates: [] };

  // ── PRESET routes: a pickup point has ONE canonical time ────────────────
  // The stop order is the vehicle's Route Setting sequence and every point's
  // time comes from PickupPoint.baseETA (see ensurePickupPointSchedule), so a
  // point keeps the SAME time on every day of every week — Sankar at 20:55 is
  // 20:55 on Monday AND Friday. Re-deriving the times here from whatever the
  // learned legs held at that moment was how the SAME point ended up at 21:10
  // Monday and 21:05 Friday. A rider whose point is not on this vehicle is an
  // extra stop and inherits the previous stop's time, so the pickup column
  // stays non-decreasing.
  if (preset?.routeType === "PRESET_10PM" && preset.vehicleId) {
    const canonical = await ensurePickupPointSchedule(preset.vehicleId).catch(
      () => null
    );
    if (canonical && canonical.success) {
      const { points, times } = canonical.schedule;
      const resolved = trips.map((t) => {
        const pointId = resolveCanonicalPointId(t, points);
        return pointId ? times.get(pointId) ?? null : null;
      });
      let cursor: string | null = resolved.find((t) => t != null) ?? null;
      const filled = resolved.map((t) => {
        if (t) cursor = t;
        return cursor;
      });
      if (filled.every((t) => t !== null)) {
        return {
          updates: trips.map((t, i) => ({
            where: { id: t.id },
            data: {
              sequenceInTrip: i + 1,
              pickupTime: filled[i] as string,
              emailSentAt: null,
            },
          })),
        };
      }
    }
    // No usable point schedule (e.g. missing coordinates / no points) → fall
    // through to the leg-based timing below so the drag still works.
  }

  const arrivalMinutes = arrivalMinutesForLabel(arrivalTime);
  if (arrivalMinutes == null) {
    return { updates: [], error: `Unknown arrival label "${arrivalTime}".` };
  }
  const learned = await loadLearnedLegs(shiftKeyForLabel(arrivalTime));

  const points = trips.map((t) => {
    const address =
      t.pickupType === "PRESET_POINT" ? t.pickupPoint?.address : t.pickupAddress;
    return {
      tripId: t.id,
      lat: address?.latitude ?? null,
      lng: address?.longitude ?? null,
      key: address ? `addr:${address.id}` : null,
    } satisfies TimingPoint;
  });

  // Collapse CONSECUTIVE stops at the same address into one schedule slot —
  // riders sharing a preset pickup point must SHARE its pickup time, never
  // stagger 5 minutes apart per row (the preset-sequence consistency rule;
  // this staggering was how moved riders ended up at 21:15/21:20 on a point
  // whose schedule time is 21:10).
  const slots: Array<{
    lat: number | null;
    lng: number | null;
    key: string | null;
    members: number[];
  }> = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const last = slots[slots.length - 1];
    if (last && p.key !== null && p.key === last.key) {
      last.members.push(i);
    } else {
      slots.push({ lat: p.lat, lng: p.lng, key: p.key, members: [i] });
    }
  }

  const officeName = officeLocation ?? "Regnum";
  const office = officeCoordinatesFor(officeName);

  const slotPoints = slots.map((s) => ({
    tripId: "__slot__",
    lat: s.lat,
    lng: s.lng,
    key: s.key,
  }));
  const slotLabel = (i: number): string => {
    const trip = trips[slots[i].members[0]];
    const text =
      trip.pickupType === "PRESET_POINT"
        ? trip.pickupPoint?.name?.trim()
        : null;
    return text || slots[i].key || "stop";
  };
  const legs: Array<number | null> = [];
  for (let i = 0; i < slotPoints.length; i++) {
    const next =
      i < slotPoints.length - 1
        ? slotPoints[i + 1]
        : {
            tripId: "__office__",
            lat: office.lat,
            lng: office.lng,
            key: `office:${officeName}`,
          };
    legs.push(legDriveMinutes(slotPoints[i], next, learned));
  }
  const missingLegs = legs
    .map((m, i) =>
      m == null
        ? `${slotLabel(i)} → ${
            i === slots.length - 1 ? officeName : slotLabel(i + 1)
          }`
        : null
    )
    .filter((s): s is string => s !== null);
  if (missingLegs.length > 0) {
    return {
      updates: [],
      error: `No finalized/taught drive time yet for: ${missingLegs.join(
        ", "
      )} — pickup times come from trained gaps only (≥ ${LEARN_MIN_SAMPLES} observations; finalize the route or use "Teach from manual plan").`,
    };
  }
  const legMinutes = legs as number[];

  let slotMinutes: number[];
  try {
    slotMinutes = backCalculatePickupMinutes(arrivalMinutes, legMinutes);
  } catch {
    const total = legMinutes.reduce((a, b) => a + b, 0);
    return {
      updates: [],
      error: `This order takes ${total} min — longer than the ${arrivalTime} window allows.`,
    };
  }

  // Expand the slot times back onto their member trips (same point ⇒ same time).
  const pickupMinutes: number[] = new Array(points.length);
  slots.forEach((s, i) => {
    for (const m of s.members) pickupMinutes[m] = slotMinutes[i];
  });

  return {
    updates: trips.map((t, i) => ({
      where: { id: t.id },
      data: {
        sequenceInTrip: i + 1,
        pickupTime: minutesToTimeString(pickupMinutes[i]),
        emailSentAt: null,
      },
    })),
  };
}

/**
 * Drive minutes for one leg — TRAINED DATA ONLY. Returns the learned median
 * once that exact leg has >= LEARN_MIN_SAMPLES observations (mined from
 * finalized routes / taught manual plans); `null` when the leg was never
 * learned. The 5 min/km distance fallback was removed — callers turn `null`
 * into an error naming the missing legs.
 */
function legDriveMinutes(
  a: TimingPoint,
  b: TimingPoint,
  learned: Map<string, LearnedLegRow>
): number | null {
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
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const plan = await prisma.routePlan.findUnique({
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
    if (!plan) return { success: false, error: "Route not found." };
    if (plan.status !== "DRAFT" && plan.status !== "UNDER_REVIEW") {
      return {
        success: false,
        error: `This route is ${plan.status}. Only draft routes can be reordered.`,
      };
    }
    const currentIds = plan.tripAssignments
      .map((t) => t.id)
      .sort((a, b) => (a < b ? -1 : 1));
    const sortedInput = [...orderedTripIds].sort((a, b) => (a < b ? -1 : 1));
    const sameSet =
      currentIds.length === sortedInput.length &&
      sortedInput.every((id, i) => id === currentIds[i]);
    if (!sameSet) {
      return {
        success: false,
        error: "The row list does not match this route's employees.",
      };
    }

    const tripsById = new Map(
      plan.tripAssignments.map((t) => [t.id, t] as const)
    );
    const ordered = (orderedTripIds
      .map((id) => tripsById.get(id))
      .filter(Boolean) as (typeof plan.tripAssignments)[number][]);

    // Re-time the PROSPECTIVE order before writing anything, so a reorder that
    // can't fit its arrival window is rejected without touching the rows.
    // PRESET_10PM nuance: a MANUAL reorder is honored as an override. Same-point
    // shuffles keep every point's canonical schedule time; a cross-point drag
    // switches this route's re-time to the leg-based schedule so the pickup
    // times stay monotonic along the NEW order (the "point order is fixed"
    // rule governs Route Setting + re-maps, not a deliberate drag on a draft).
    let retimePreset: { routeType: string | null; vehicleId: string } | undefined;
    if (plan.routeType === "PRESET_10PM") {
      const vehiclePoints = await prisma.pickupPoint.findMany({
        where: { vehicleId: plan.vehicleId, isActive: true },
        orderBy: { sequence: "asc" },
        select: { id: true, sequence: true, addressId: true, name: true },
      });
      let crossesPoint = false;
      let prevSeq: number | null = null;
      for (const t of ordered) {
        const seq = resolvePresetSequence(t, vehiclePoints);
        if (seq != null) {
          if (prevSeq != null && seq < prevSeq) {
            crossesPoint = true;
            break;
          }
          prevSeq = seq;
        }
      }
      retimePreset =
        crossesPoint || prevSeq === null
          ? undefined
          : { routeType: plan.routeType, vehicleId: plan.vehicleId };
    }

    const retimes = await buildRetimeUpdates(
      plan.arrivalTime,
      plan.officeLocation,
      ordered,
      retimePreset
    );
    if (retimes.error) return { success: false, error: retimes.error };

    const before = currentIds.map((id) => ({ tripId: id }));
    await prisma.$transaction(
      [
        ...retimes.updates.map((update, i) =>
          prisma.tripAssignment.update({
            where: update.where,
            data: {
              ...update.data,
              sequenceInTrip: i + 1,
              manuallyOverridden: true,
            },
          })
        ),
      ],
      BATCH_TX_OPTIONS
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

    // The tuned order is the working pattern for the week: reflect it onto the
    // same vehicle + arrival time on the other draft days.
    try {
      await mirrorRouteEditsAcrossWeek(routePlanId);
    } catch (err) {
      console.warn(
        "WEEK_MIRROR (reorder) skipped:",
        errorMessage(err)
      );
    }

    revalidatePath("/facilities/automated-route-planner");
    revalidatePath("/facilities/route-planning");
    return {
      success: true,
      message: "Row order updated and pickup times recalculated.",
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizedActionMessage(
        "reorderRouteTrips",
        error,
        "Failed to reorder the route rows."
      ),
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
  targetRoutePlanId: string,
  options?: { insertBeforeTripId?: string }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    // Load the trip with BOTH routes' full assignment lists (incl. pickup
    // geometry) up front so we can validate AND pre-compute every re-time
    // before writing a single row.
    const trip = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId },
      include: {
        routePlan: {
          include: {
            vehicle: true,
            tripAssignments: {
              include: {
                pickupAddress: true,
                pickupPoint: { include: { address: true } },
              },
            },
          },
        },
        employee: true,
        pickupAddress: true,
        pickupPoint: { include: { address: true } },
      },
    });
    const target = await prisma.routePlan.findUniqueOrThrow({
      where: { id: targetRoutePlanId },
      include: {
        vehicle: true,
        tripAssignments: {
          include: {
            pickupAddress: true,
            pickupPoint: { include: { address: true } },
          },
        },
      },
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
      : Math.min(DYNAMIC_GROUP_CAPACITY, target.vehicle.capacity ?? DYNAMIC_GROUP_CAPACITY);
    if (target.tripAssignments.length >= capacityLimit) {
      const seats = isPreset
        ? "unlimited"
        : `${target.tripAssignments.length}/${capacityLimit} seats taken`;
      return {
        success: false,
        error: `Vehicle ${target.vehicle.vehicleNumber} has no free seat (${seats}).`,
      };
    }

    // Prospective post-move trip lists (sorted by current sequence).
    const sourceTrips = [...trip.routePlan.tripAssignments]
      .filter((t) => t.id !== tripAssignmentId)
      .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip);
    const movedLike = {
      id: trip.id,
      pickupType: trip.pickupType,
      pickupPoint: trip.pickupPoint,
      pickupAddress: trip.pickupAddress,
    };
    const targetTrips: typeof movedLike[] = target.tripAssignments
      .slice()
      .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip)
      .map((t) => ({
        id: t.id,
        pickupType: t.pickupType,
        pickupPoint: t.pickupPoint,
        pickupAddress: t.pickupAddress,
      }));

    if (isPreset) {
      // PRESET_10PM: the stop order IS the vehicle's Route Setting pickup-point
      // sequence. The moved rider must land at their point's position (grouped
      // with same-point riders) — appending at the end silently inverted the
      // preset order (the "preset sequence not followed" bug).
      const vehiclePoints = await prisma.pickupPoint.findMany({
        where: { vehicleId: target.vehicleId, isActive: true },
        orderBy: { sequence: "asc" },
        select: { id: true, sequence: true, addressId: true, name: true },
      });
      const insertAt = presetInsertIndex(targetTrips, movedLike, vehiclePoints);
      targetTrips.splice(insertAt, 0, movedLike);
    } else if (options?.insertBeforeTripId) {
      // Dynamic/corridor route: land the rider at the exact dropped position —
      // before the row the user dropped on. Unknown id ⇒ append at the end.
      const insertAt = targetTrips.findIndex(
        (t) => t.id === options.insertBeforeTripId
      );
      if (insertAt >= 0) {
        targetTrips.splice(insertAt, 0, movedLike);
      } else {
        targetTrips.push(movedLike);
      }
    } else {
      targetTrips.push(movedLike);
    }

    // Re-time BOTH prospective lists in memory first — if either can't fit its
    // arrival window, reject the move before anything is committed.
    const sourceRetime = await buildRetimeUpdates(
      trip.routePlan.arrivalTime,
      trip.routePlan.officeLocation,
      sourceTrips,
      { routeType: trip.routePlan.routeType, vehicleId: trip.routePlan.vehicleId }
    );
    if (sourceRetime.error) return { success: false, error: sourceRetime.error };

    const targetRetime = await buildRetimeUpdates(
      target.arrivalTime,
      target.officeLocation,
      targetTrips,
      { routeType: target.routeType, vehicleId: target.vehicleId }
    );
    if (targetRetime.error) return { success: false, error: targetRetime.error };

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

    // Single atomic batch: audit trail + source re-sequencing + moved trip +
    // target re-sequencing all commit together or not at all.
    await prisma.$transaction(
      [
        prisma.routePlanOverride.create({
          data: {
            routePlanId: trip.routePlanId,
            changedById: session.id,
            changeType: "VEHICLE_REASSIGN",
            affectedEmployeeId: trip.employeeId,
            beforeState: JSON.stringify(beforeState),
            afterState: JSON.stringify(afterState),
            reason:
              "Moved between vehicles from the generated-routes breakdown.",
          },
        }),
        prisma.tripAssignment.update({
          where: { id: tripAssignmentId },
          data: {
            routePlanId: targetRoutePlanId,
            vehicleId: target.vehicleId,
            manuallyOverridden: true,
            emailSentAt: null,
          },
        }),
        ...sourceRetime.updates.map((u) =>
          prisma.tripAssignment.update(u)
        ),
        ...targetRetime.updates.map((u) => prisma.tripAssignment.update(u)),
      ],
      BATCH_TX_OPTIONS
    );

    // Both routes changed shape — propagate each pattern to its own other
    // draft days of the week. Best-effort: the move itself already committed.
    try {
      await mirrorRouteEditsAcrossWeek(trip.routePlanId);
    } catch (err) {
      console.warn("WEEK_MIRROR (source of move) skipped:", errorMessage(err));
    }
    try {
      await mirrorRouteEditsAcrossWeek(targetRoutePlanId);
    } catch (err) {
      console.warn("WEEK_MIRROR (target of move) skipped:", errorMessage(err));
    }

    revalidatePath("/facilities/automated-route-planner");
    revalidatePath("/facilities/route-planning");
    return {
      success: true,
      message: `${trip.employee.fullName} moved to ${target.vehicle.vehicleNumber} — both routes re-timed.`,
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizedActionMessage(
        "moveTripToRoute",
        error,
        "Failed to move the employee."
      ),
    };
  }
}

/**
 * Drop an employee onto a PINNED-BUT-UNUSED vehicle card (a vehicle that is
 * pinned for this route day in Route Setting but has NO generated plan that
 * day — the "blank card" in the breakdown). The blank target card has no
 * RoutePlan row yet, so we must CREATE the target plan (cloned from the source
 * plan's day window / arrival / destination, on the unused vehicle) before the
 * move can commit. If the move fails for any reason the freshly-created plan is
 * rolled back, so a stray empty DRAFT never lingers on the unused vehicle.
 */
export async function moveTripToUnusedVehicle(
  tripAssignmentId: string,
  targetVehicleId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  let targetRoutePlanId: string | null = null;
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    // NOTE: RoutePlan has NO `vehicleShiftAssignment` relation — the pin is
    // fetched separately below (prisma.vehicleShiftAssignment.findFirst keyed
    // on vehicleId + week), so it must NOT appear in this include.
    const trip = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId },
      include: {
        routePlan: {
          include: { vehicle: true },
        },
        employee: true,
      },
    });
    const source = trip.routePlan;
    if (
      source.status !== "DRAFT" &&
      source.status !== "UNDER_REVIEW"
    ) {
      return {
        success: false,
        error: "Only draft routes can be changed. Finalize to lock this route.",
      };
    }

    // The unused vehicle must actually be route-pinned on the SAME day / week
    // and share the SAME arrival window — otherwise the employee's arrival
    // time would silently change. Grab the pin for the source's day.
    const pin = await prisma.vehicleShiftAssignment.findFirst({
      where: {
        vehicleId: targetVehicleId,
        // The vehicle is route-pinned per WEEK (startDate = the week's Monday).
        // Key on the SOURCE plan's own week window so we never depend on a
        // relation that isn't included in the trip's plan query.
        startDate: { equals: toUtcMidnight(source.weekStartDate) },
        isActive: true,
      },
      include: { vehicle: true },
    });
    if (!pin) {
      return {
        success: false,
        error: "That vehicle isn't route-pinned on this day — can't drop here.",
      };
    }

    // Target day pins are stored per vehicle as a WEEK record; a "blank card"
    // day means the vehicle has no plan for that dayOfWeek. Verify there truly
    // is no plan on that vehicle for the source day before creating one (two
    // plans on the same vehicle/day/arrival would collide on the unique key).
    const existingTarget = await prisma.routePlan.findFirst({
      where: {
        vehicleId: targetVehicleId,
        dayDate: source.dayDate,
        arrivalTime: source.arrivalTime,
      },
    });
    if (existingTarget) {
      // Already mapped that day — fall back to a normal vehicle-to-vehicle move.
      const res = await moveTripToRoute(tripAssignmentId, existingTarget.id);
      return {
        success: res.success,
        message: res.message,
        error: res.error,
      };
    }

    // Create the target plan on the unused vehicle, cloning the source's day
    // window (office destination, arrival window, departure) so re-timing stays
    // consistent. Status DRAFT so the atomic move + re-time can proceed.
    const created = await prisma.routePlan.create({
      data: {
        weekStartDate: source.weekStartDate,
        dayOfWeek: source.dayOfWeek,
        dayDate: source.dayDate,
        vehicleId: targetVehicleId,
        arrivalTime: source.arrivalTime,
        routeType: source.routeType,
        status: "DRAFT",
        officeLocation: source.officeLocation,
        destinationLat: source.destinationLat,
        destinationLng: source.destinationLng,
        departureTime: source.departureTime
          ? new Date()
          : null,
        createdById: session.id,
      },
    });
    targetRoutePlanId = created.id;

    // Now the standard atomic move; if it fails we roll the fresh plan back.
    const res = await moveTripToRoute(tripAssignmentId, created.id);
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      message: res.message ?? "Employee moved onto the unused vehicle.",
    };
  } catch (error) {
    // Don't leave a stray empty DRAFT on the unused vehicle if the move failed.
    if (targetRoutePlanId) {
      try {
        await prisma.routePlan.delete({ where: { id: targetRoutePlanId } });
      } catch {
        /* best-effort cleanup */
      }
    }
    return {
      success: false,
      error: sanitizedActionMessage(
        "moveTripToUnusedVehicle",
        error,
        "Failed to move the employee."
      ),
    };
  }
}
