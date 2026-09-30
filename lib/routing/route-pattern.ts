import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { normalizeOfficeLocation } from "@/lib/constants/office-locations";

/**
 * Route-pattern learning + reflection.
 *
 * A FINALIZED (or edited) vehicle route for one arrival time is captured as an
 * ordered list of {employee, pickup time} stops — the "pattern". That pattern
 * is (a) stored as a RouteTemplate so the next week's RUN MAPPING replays it
 * (see algorithms.ts generateCorridorRoutes) and (b) reflected onto the same
 * vehicle + arrival time on the OTHER draft days of the current week, so
 * Facilities' Monday edits flow to Tue-Fri instantly — no re-mapping.
 *
 * Match key is the employee id — the stable rider identity regardless of
 * address/pickup-point edits. Riders present on a sibling day but NOT in the
 * pattern keep riding, appended after the pattern in their current order.
 */

export type RoutePatternStop = {
  employeeId: string | null;
  seq: number;
  pickupTime: string | null;
  pickupType: string | null;
  pickupPointId: string | null;
  addressId: string | null;
  employeeLabel: string | null;
  stopLabel: string | null;
};

export type PatternCaptureAssignment = {
  sequenceInTrip: number;
  employeeId: string;
  pickupTime: string | null;
  pickupType: string;
  pickupPointId: string | null;
  pickupAddressId: string | null;
  employee?: { fullName?: string | null };
  pickupAddress?: { addressText?: string | null } | null;
  pickupPoint?: { name?: string | null } | null;
};

/** Ordered visiting pattern from a route's trip assignments (1-based seq). */
export function captureRoutePattern(
  assignments: PatternCaptureAssignment[]
): RoutePatternStop[] {
  return [...assignments]
    .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip)
    .map((t, i) => ({
      employeeId: t.employeeId,
      seq: i + 1,
      pickupTime: t.pickupTime,
      pickupType: t.pickupType,
      pickupPointId: t.pickupPointId,
      addressId: t.pickupAddressId,
      employeeLabel: t.employee?.fullName ?? null,
      stopLabel: t.pickupPoint?.name ?? t.pickupAddress?.addressText ?? null,
    }));
}

export function shiftKeyForLabel(label: string): "10PM" | "11PM" | "12AM-6AM" {
  const normalized = (label || "").toUpperCase().replace(/\s+/g, "");
  if (normalized === "10PM") return "10PM";
  if (normalized === "11PM") return "11PM";
  return "12AM-6AM";
}

/**
 * Reorder an already-planned route's members so the learned pattern's riders
 * ride first in the learned order, and everyone not in the pattern (new
 * riders joining this shift) rides after them in their planned order. Used by
 * the corridor generators to replay a tuned route on the next mapping.
 */
export function patternOrderForMembers<T>(
  patternEmployeeIds: Array<string | null>,
  order: T[],
  idOf: (item: T) => string | undefined
): { order: T[]; replayed: boolean } {
  const claimed = new Set<string>();
  const matched: T[] = [];
  for (const id of patternEmployeeIds) {
    if (!id || claimed.has(id)) continue;
    const item = order.find((o) => {
      const oid = idOf(o);
      return oid === id && !claimed.has(oid);
    });
    if (item) {
      matched.push(item);
      claimed.add(id);
    }
  }
  const rest = order.filter((o) => {
    const oid = idOf(o);
    return oid == null || !claimed.has(oid);
  });
  if (matched.length === 0) return { order, replayed: false };
  return { order: [...matched, ...rest], replayed: true };
}

export type ReflectionUpdate = {
  tripId: string;
  sequenceInTrip: number;
  pickupTime: string | null;
};

/**
 * Compute the edits to make one route's assignments match a pattern: pattern
 * employees land at their pattern position + pickup time; assignments whose
 * employee is not in the pattern ride after them in their existing order.
 */
export function reflectPatternOntoAssignments(
  pattern: RoutePatternStop[],
  assignments: {
    id: string;
    employeeId: string;
    sequenceInTrip: number;
    pickupTime: string | null;
  }[]
): ReflectionUpdate[] {
  const updates: ReflectionUpdate[] = [];
  const consumed = new Set<string>();
  let seq = 0;

  for (const stop of pattern) {
    if (!stop.employeeId) continue;
    const trips = assignments.filter(
      (a) => a.employeeId === stop.employeeId && !consumed.has(a.id)
    );
    for (const t of trips) {
      consumed.add(t.id);
      seq++;
      updates.push({ tripId: t.id, sequenceInTrip: seq, pickupTime: stop.pickupTime });
    }
  }

  const rest = assignments
    .filter((a) => !consumed.has(a.id))
    .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip);
  for (const t of rest) {
    seq++;
    updates.push({ tripId: t.id, sequenceInTrip: seq, pickupTime: t.pickupTime });
  }

  return updates;
}

/**
 * Reflect the pattern of one (edited/finalized) route onto the same
 * vehicle + arrival time on the other DRAFT days of its week. Returns the
 * number of sibling days updated. Finalized/executed days are never touched.
 */
export async function mirrorRouteEditsAcrossWeek(
  routePlanId: string
): Promise<{ mirroredDays: number; vehicleLabel: string }> {
  const source = await prisma.routePlan.findUnique({
    where: { id: routePlanId },
    include: {
      vehicle: { select: { vehicleNumber: true } },
      tripAssignments: {
        include: { employee: true, pickupPoint: true, pickupAddress: true },
      },
    },
  });
  if (!source || source.tripAssignments.length === 0) {
    return { mirroredDays: 0, vehicleLabel: source?.vehicle.vehicleNumber ?? "" };
  }
  const pattern = captureRoutePattern(source.tripAssignments);
  const siblingFilter: Prisma.RoutePlanWhereInput = {
    weekStartDate: source.weekStartDate,
    dayDate: { not: source.dayDate },
    vehicleId: source.vehicleId,
    arrivalTime: source.arrivalTime,
    status: "DRAFT",
  };

  const siblings = await prisma.routePlan.findMany({
    where: siblingFilter,
    include: { tripAssignments: { orderBy: { sequenceInTrip: "asc" } } },
  });

  let mirroredDays = 0;
  const patternSnapshot = pattern.map((s) => ({
    employeeId: s.employeeId,
    seq: s.seq,
    pickupTime: s.pickupTime,
  }));

  // Mirror each sibling day in its own transaction, run in parallel — the
  // sequential loop stacked N quick transactions into ~4× the wall time.
  const ops = siblings.map(async (sibling) => {
    if (sibling.tripAssignments.length === 0) return false;
    const updates = reflectPatternOntoAssignments(
      pattern,
      sibling.tripAssignments.map((t) => ({
        id: t.id,
        employeeId: t.employeeId,
        sequenceInTrip: t.sequenceInTrip,
        pickupTime: t.pickupTime,
      }))
    );
    if (updates.length === 0) return false;

    await prisma.$transaction(
      [
        ...updates.map((u) =>
          prisma.tripAssignment.update({
            where: { id: u.tripId },
            data: {
              sequenceInTrip: u.sequenceInTrip,
              pickupTime: u.pickupTime,
              manuallyOverridden: true,
              emailSentAt: null,
              approachBearing: null,
              snappedLat: null,
              snappedLng: null,
            },
          })
        ),
        // The order changed → any cached analysis/geometry is stale until the
        // map recomputes it on demand.
        prisma.routePlan.update({
          where: { id: sibling.id },
          data: { routeAnalysis: Prisma.JsonNull, appliedCandidateId: null },
        }),
        prisma.routePlanOverride.create({
          data: {
            routePlanId: sibling.id,
            changedById: "system",
            changeType: "WEEK_MIRROR",
            beforeState: "{}",
            afterState: JSON.stringify({ pattern: patternSnapshot }),
            reason: `Mirrored from the ${source.arrivalTime} ${source.vehicle.vehicleNumber} route on ${source.dayDate.toISOString().slice(0, 10)}.`,
          },
        }),
      ],
      {
        maxWait: 30000,
        timeout: 90000,
      }
    );
    return true;
  });

  mirroredDays = (await Promise.all(ops)).filter(Boolean).length;

  return { mirroredDays, vehicleLabel: source.vehicle.vehicleNumber };
}

/**
 * Store/refresh the learned RouteTemplate for a route (vehicle + arrival time)
 * so the next week's mapping replays the tuned sequence + pickup times.
 */
export async function learnRouteTemplateFromAssignments(input: {
  vehicleId: string;
  arrivalTime: string;
  office: string | null;
  sourcePlanId: string;
  assignments: PatternCaptureAssignment[];
}): Promise<{ learned: boolean; templateId?: string }> {
  const pattern = captureRoutePattern(input.assignments);
  if (pattern.length === 0) return { learned: false };

  const shiftKey = shiftKeyForLabel(input.arrivalTime);
  const office = normalizeOfficeLocation(input.office ?? "Regnum");

  const template = await prisma.routeTemplate.upsert({
    where: {
      vehicleId_arrivalTime: {
        vehicleId: input.vehicleId,
        arrivalTime: input.arrivalTime,
      },
    },
    update: {
      sourcePlanId: input.sourcePlanId,
      office,
      shiftKey,
      lastLearnedAt: new Date(),
    },
    create: {
      vehicleId: input.vehicleId,
      arrivalTime: input.arrivalTime,
      office,
      shiftKey,
      sourcePlanId: input.sourcePlanId,
    },
  });

  await prisma.$transaction([
    prisma.routeTemplateStop.deleteMany({ where: { templateId: template.id } }),
    prisma.routeTemplateStop.createMany({
      data: pattern.map((s) => ({
        templateId: template.id,
        seq: s.seq,
        employeeId: s.employeeId,
        pickupType: s.pickupType,
        pickupPointId: s.pickupPointId,
        addressId: s.addressId,
        pickupTime: s.pickupTime,
        employeeLabel: s.employeeLabel,
        stopLabel: s.stopLabel,
      })),
    }),
  ]);

  return { learned: true, templateId: template.id };
}