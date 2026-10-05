/**
 * Core route generation algorithms (OSRM / OpenStreetMap based — no API keys).
 *
 *  - 10 PM: Preset pickup-point sequences — employees match a vehicle when
 *           their pickup point is one of that vehicle's points.
 *  - 11 PM: Corridor path routing — each route is anchored at the passenger
 *           FARTHEST from the office (distance-matrix road km — minutes can
 *           invert near homes) and walks back toward it one nearest hop at a
 *           time; remaining homes near the already-planned path are
 *           attached to it (bounded detour), and a second vehicle only opens
 *           when no planned route has a spare seat. Pickup times
 *           back-calculated so the vehicle reaches the office by 11 PM.
 *  - 12 AM-6 AM: Same corridor path routing per late-night shift, reusing
 *           the 10 PM vehicles after a rest period.
 *
 * Every route's LAST destination is the vehicle's office (RoutePlan snapshots
 * officeLocation + destinationLat/Lng). Employees are served by vehicles of
 * their own office (User.officeLocation matches Vehicle.officeLocation).
 */

import "server-only";
import { mapWithConcurrency } from "@/lib/concurrency";
import { prisma } from "@/lib/prisma";
import {
  addUtcCalendarDays,
  dhakaDateTimeFromMinutes,
} from "@/lib/date/week";
import {
  getDistanceMatrix,
  getRoutePolyline,
  prefetchRoutePolylines,
  warmPolylineCache,
  type Location,
  type PolylineWarmKey,
} from "./osrm";
import { geocodeAddress } from "./geocoder";
import { patternOrderForMembers } from "./route-pattern";
import {
  haversineDistance,
  bearingDegrees,
  minutesToTimeString,
  timeStringToMinutes,
} from "./utils";
import {
  ARRIVAL_TIMES_BY_SHIFT,
  LABEL_FOR_ARRIVAL_VALUE,
} from "@/lib/constants/route-shifts";
import {
  normalizeOfficeLocation,
  officeCoordinatesFor,
  type OfficeCoords,
} from "@/lib/constants/office-locations";
import {
  ensurePickupPointSchedule,
  loadLearnedLegs,
  backCalculatePickupMinutes,
  PICKUP_GRID_MINUTES,
  LEARN_MIN_SAMPLES,
} from "./pickup-schedule";
import {
  arrivalMinutesFromLabel,
  dateForArrivalMinutes,
  distancePointToPolylineKm as distanceToPolylineKm,
  errorMessage,
  hhmmToMinutes,
  legRoadKey,
  legRoadKmFromIndex,
  matrixDistanceKm,
  matrixDurationMin,
  planCorridorRoutes as planCorridorRoutesCore,
  poolForOffice as poolForOfficeCore,
} from "./corridor-core";
import type {
  ClusterMember,
  EmployeeShape,
  HomeAddressShape,
  PlannedCorridorRoute,
  ScheduleAgg,
  VehiclePoolShape,
} from "./corridor-core";

export { DYNAMIC_GROUP_CAPACITY, distancePointToPolylineKm, errorMessage } from "./corridor-core";

export interface RouteGenerationResult {
  success: boolean;
  routesCreated: number;
  errors: string[];
}

export const SHIFT_KEYS = ["10PM", "11PM", "12AM-6AM"] as const;
export type ShiftKey = (typeof SHIFT_KEYS)[number];

/** VehicleShiftAssignment stores shifts as a JSON array of these keys. */
async function pinnedVehicleIdsForShift(
  weekStartDate: Date,
  shiftKey: ShiftKey
): Promise<string[]> {
  const assignments = await prisma.vehicleShiftAssignment.findMany({
    where: { startDate: weekStartDate, isActive: true },
    select: { vehicleId: true, shifts: true },
  });
  const ids = new Set<string>();
  for (const row of assignments) {
    let shifts: string[] = [];
    try {
      shifts = JSON.parse(row.shifts);
    } catch {
      shifts = [];
    }
    if (Array.isArray(shifts) && shifts.includes(shiftKey)) ids.add(row.vehicleId);
  }
  return Array.from(ids);
}

/** Resolve an employee's home address, auto-geocoding their free-text address
 * via OpenStreetMap when coordinates are missing (best effort).
 *
 * FIXED-ARRIVAL employees ride from their assigned PICK-UP POINT, not from
 * their home address: their `pickupAddressId` names an active PickupPoint whose
 * coordinates Facilities maintains on the Pick-up Points page. Returning the
 * pickup-point Address here (when it carries real coordinates) keeps the fixed-
 * arrival rider's lat/lng in sync with that pickup point — if Facilities later
 * edits the point's coordinates, the next RUN MAPPING picks them up at the new
 * location instead of a stale home pin. Falls back to the home address only
 * when the pickup point has no usable coordinates (and otherwise behaves
 * exactly as before for regular employees). */
async function resolveHomeAddress(
  employee: EmployeeShape
): Promise<HomeAddressShape | null> {
  const pickup = employee.pickupAddress;
  if (
    employee.pickupAddressId &&
    pickup &&
    !(pickup.latitude === 0 && pickup.longitude === 0)
  ) {
    return pickup;
  }

  let home = employee.homeAddress;
  const text = employee.address?.trim();

  if ((!home || (home.latitude === 0 && home.longitude === 0)) && text) {
    try {
      const geocoded = await geocodeAddress(text);
      if (geocoded) {
        home = await prisma.address.upsert({
          where: { addressText: text },
          update: { latitude: geocoded.lat, longitude: geocoded.lng },
          create: {
            addressText: text,
            latitude: geocoded.lat,
            longitude: geocoded.lng,
          },
        });
        await prisma.user.update({
          where: { id: employee.id },
          data: { homeAddressId: home.id },
        });
      }
    } catch {
      // best-effort; the caller records a human-readable error
    }
  }

  return home;
}

export type { ClusterMember, PlannedCorridorRoute, VehiclePoolShape } from "./corridor-core";

/**
 * Algorithm A: 10 PM routes (preset pickup-point sequences + ETA shifts).
 * Employees are matched to a vehicle when their pickup point is one of that
 * vehicle's points. Each route records the vehicle's office as its last
 * destination (completion = last pickup + travel to office).
 */
export async function generate10PMRoutes(
  weekStartDate: Date,
  dayOfWeek: number
): Promise<RouteGenerationResult> {
  const errors: string[] = [];
  let routesCreated = 0;

  try {
    const schedules = (await prisma.weeklyScheduleDay.findMany({
      where: {
        weeklySchedule: {
          weekStartDate,
          status: "APPROVED",
        },
        dayOfWeek: dayOfWeek + 1,
        // weeklyScheduleDay.arrivalTime is a stored "HH:mm" value ("22:00"),
        // not the "10 PM" label used on RoutePlan.
        arrivalTime: "22:00",
        needsTransport: true,
      },
      include: {
        weeklySchedule: {
          include: {
            employee: {
              include: {
                pickupAddress: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    })) as unknown as ScheduleAgg[];

    if (schedules.length === 0) {
      return { success: true, routesCreated: 0, errors };
    }

    // When 10 PM pins exist, only those vehicles may receive preset routes.
    // This keeps a vehicle pinned for both 10 PM and 11 PM eligible in both
    // route-planning passes.
    const [pinnedIds10PM, activePoints] = await Promise.all([
      pinnedVehicleIdsForShift(weekStartDate, "10PM"),
      prisma.pickupPoint.findMany({
        where: { isActive: true },
        include: {
          address: true,
          vehicle: { select: { vehicleNumber: true, officeLocation: true } },
        },
        orderBy: [{ vehicleId: "asc" }, { sequence: "asc" }],
      }),
    ]);

    type ActivePoint = (typeof activePoints)[number];
    const pointByAddressId = new Map<string, ActivePoint>();
    const pointByName = new Map<string, ActivePoint>();
    const pointsByVehicle = new Map<string, ActivePoint[]>();
    for (const point of activePoints) {
      if (point.addressId && !pointByAddressId.has(point.addressId)) {
        pointByAddressId.set(point.addressId, point);
      }
      const nameKey = point.name.toLowerCase();
      if (!pointByName.has(nameKey)) pointByName.set(nameKey, point);
      const list = pointsByVehicle.get(point.vehicleId);
      if (list) list.push(point);
      else pointsByVehicle.set(point.vehicleId, [point]);
    }

    // Group by vehicle: an employee attaches to the vehicle that owns their
    // pickup point.
    const vehicleGroups = new Map<
      string,
      { office: string; schedules: ScheduleAgg[] }
    >();

    for (const schedule of schedules) {
      const employee = schedule.weeklySchedule.employee;

      // An employee only belongs to a 10 PM route when their profile links
      // them to an active pickup point (pickupAddressId). Never fall back to
      // an arbitrary point — that would silently produce empty routes.
      let pickupPoint = employee.pickupAddressId
        ? pointByAddressId.get(employee.pickupAddressId) ?? null
        : null;

      // NAME fallback: the Pick-up Points page and Route Setting can land on
      // SIBLING Address rows for the same stop (case-variant rows, or a raw
      // coordinate-string row created by the old geocoder), so a strict
      // addressId join misses even when names match — which surfaced as the
      // "has no matching 10 PM pickup point" error for employees whose point
      // IS on the vehicle's pickup sequence. Fall back to a case-insensitive
      // name match so the employee still attaches to the owning vehicle.
      if (!pickupPoint && employee.pickupPoint?.trim()) {
        pickupPoint = pointByName.get(employee.pickupPoint.trim().toLowerCase()) ?? null;
      }

      if (!pickupPoint) {
        errors.push(
          `Employee ${employee.fullName || employee.id} has no matching 10 PM pickup point`
        );
        continue;
      }

      if (pinnedIds10PM.length > 0 && !pinnedIds10PM.includes(pickupPoint.vehicleId)) {
        errors.push(
          `Employee ${employee.fullName || employee.id} is assigned to vehicle ${pickupPoint.vehicleId}, which is not pinned for 10 PM`
        );
        continue;
      }

      const owned = vehicleGroups.get(pickupPoint.vehicleId);
      if (owned) {
        owned.schedules.push(schedule);
      } else {
        vehicleGroups.set(pickupPoint.vehicleId, {
          office: pickupPoint.vehicle.officeLocation ?? "Regnum",
          schedules: [schedule],
        });
      }
    }

    for (const [vehicleId, group] of vehicleGroups) {
      try {
        const pickupPoints = pointsByVehicle.get(vehicleId) ?? [];

        // ===== SCHEDULED PICKUP TIMES (canonical, per pickup point) =====
        // `PickupPoint.baseETA` is the source of truth for a point's time, so a
        // point keeps ONE pickup time on EVERY day of EVERY week — Sankar at
        // 20:55 is 20:55 on Monday AND Friday. Re-deriving the schedule per day
        // from the learned legs (the old behaviour) was what made the same point
        // drift 21:10 → 21:05 → 21:00 across a week, because each day's run saw
        // a slightly different learned set. If the stored schedule is missing or
        // stale it is recomputed + persisted ONCE here, then never drifts again.
        const vehicleRow = pickupPoints[0]?.vehicle ?? null;
        const office = officeCoordinatesFor(group.office);
        const pointSchedule = await ensurePickupPointSchedule(vehicleId);
        if (!pointSchedule.success) {
          errors.push(
            `Vehicle ${vehicleRow?.vehicleNumber || vehicleId}: ${
              pointSchedule.error
            }`
          );
          continue;
        }
        const pickupByPointId = pointSchedule.schedule.times;

        const dayDate = addUtcCalendarDays(weekStartDate, dayOfWeek);

        const entries: Array<{
          schedule: ScheduleAgg;
          pickupPointId: string;
          pointSequence: number;
          pickupTime: string;
        }> = [];

        for (const scheduleEntry of group.schedules) {
          const employee = scheduleEntry.weeklySchedule.employee;

          // Match by linked Address row first; fall back to the point NAME
          // (case-insensitive) so employees whose pickupAddressId points at a
          // sibling Address row (case variant / raw-coords row) still land on
          // this vehicle's stop.
          const employeePointName = employee.pickupPoint?.trim().toLowerCase();
          const pickupPoint =
            pickupPoints.find(
              (p) => p.addressId === employee.pickupAddressId
            ) ??
            (employeePointName
              ? pickupPoints.find(
                  (p) =>
                    p.name.trim().toLowerCase() === employeePointName
                )
              : undefined);
          if (!pickupPoint || !pickupPoint.address) continue;

          const pickupTime = pickupByPointId.get(pickupPoint.id) ?? "";

          entries.push({
            schedule: scheduleEntry,
            pickupPointId: pickupPoint.id,
            pointSequence: pickupPoint.sequence,
            pickupTime,
          });
        }

        // Stop order must match the pickup-point sequence configured for this
        // vehicle in Route Setting (the bus revisits a stop only when several
        // employees share it). `sequence` is per-vehicle unique, so sorting on
        // it is stable and exact.
        entries.sort((a, b) => a.pointSequence - b.pointSequence);

        const completionMinutes = hhmmToMinutes(
          pointSchedule.schedule.officeArrival
        );

        const departureTime10 = dhakaDateTimeFromMinutes(dayDate, 20 * 60);

        // Idempotency over previously committed runs: regenerate only
        // DRAFT/UNDER_REVIEW drafts. A FINALIZED/EXECUTED plan for this
        // vehicle+day+shift is left untouched — re-mapping must never destroy
        // a locked route (and the (dayDate, vehicleId, arrivalTime) unique key
        // would reject re-creation anyway).
        const existing10PM = await prisma.routePlan.findUnique({
          where: {
            dayDate_vehicleId_arrivalTime: {
              dayDate,
              vehicleId,
              arrivalTime: "10 PM",
            },
          },
          select: { id: true, status: true },
        });
        if (existing10PM) {
          if (
            existing10PM.status === "FINALIZED" ||
            existing10PM.status === "EXECUTED"
          ) {
            errors.push(
              `10 PM: vehicle ${vehicleId} already has a locked ${existing10PM.status} route for this day — skipped (route kept intact)`
            );
            continue;
          }
        }

        const assignedAt = new Date();
        const createPlan = prisma.routePlan.create({
          data: {
            weekStartDate,
            dayOfWeek,
            dayDate,
            vehicleId,
            arrivalTime: "10 PM",
            routeType: "PRESET_10PM",
            status: "DRAFT",
            departureTime: departureTime10,
            estimatedCompletionTime: dateForArrivalMinutes(
              dayDate,
              completionMinutes
            ),
            officeLocation: office.name,
            destinationLat: office.lat,
            destinationLng: office.lng,
            createdById: "system",
            tripAssignments: {
              createMany: {
                data: entries.map((entry, index) => ({
                  weeklyScheduleDayId: entry.schedule.id,
                  employeeId: entry.schedule.weeklySchedule.employee.id,
                  vehicleId,
                  pickupType: "PRESET_POINT",
                  pickupPointId: entry.pickupPointId,
                  pickupTime: entry.pickupTime,
                  sequenceInTrip: index + 1,
                  assignedAt,
                })),
              },
            },
          },
          select: { id: true },
        });
        if (existing10PM) {
          await prisma.$transaction([
            prisma.routePlan.delete({ where: { id: existing10PM.id }, select: { id: true } }),
            createPlan,
          ]);
        } else {
          await createPlan;
        }

        routesCreated++;
      } catch (error) {
        errors.push(
          `Failed to generate 10 PM route for vehicle ${vehicleId}: ${
            errorMessage(error)
          }`
        );
      }
    }

    return { success: true, routesCreated, errors };
  } catch (error) {
    errors.push(
      `10 PM route generation failed: ${
        errorMessage(error)
      }`
    );
    return { success: false, routesCreated, errors };
  }
}

type CorridorLegEdge = {
  key: string;
  fromIndex: number;
  toIndex: number;
  from: Location;
  to: Location;
};

/** Resolve only the missing leg geometries the pure planner actually inspects. */
async function planCorridorRoutesWithRoadIndex(args: {
  members: ClusterMember[];
  pool: VehiclePoolShape[];
  allVehicles: VehiclePoolShape[];
  officeKey: string;
  office: OfficeCoords;
  arrivalLabel: string;
  dMin: (fromIdx: number, toIdx: number) => number;
  dKm: (fromIdx: number, toIdx: number) => number;
}): Promise<{ routes: PlannedCorridorRoute[]; errors: string[] }> {
  const { members, pool, allVehicles, officeKey, office, arrivalLabel, dMin, dKm } = args;
  const roadIndex = new Map<string, number>();
  const geometryByEdge = new Map<string, Array<{ lat: number; lng: number }> | null>();
  const maxEdgeCount = (members.length + 1) ** 2;
  let fetchedEdgeCount = 0;

  while (true) {
    const missingEdges = new Map<string, CorridorLegEdge>();
    const planned = planCorridorRoutesCore({
      members,
      pool,
      allVehicles,
      officeKey,
      office,
      isSameOffice: (vehicleOffice, key) => normalizeOfficeLocation(vehicleOffice) === key,
      arrivalLabel,
      dMin,
      dKm,
      legRoadKm: (member, from, to) => {
        const fromIndex = from.matrixIndex;
        const toIndex = to?.matrixIndex ?? 0;
        const cached = legRoadKmFromIndex(
          roadIndex,
          member.matrixIndex,
          fromIndex,
          toIndex
        );
        if (cached !== null) return cached;

        const edgeKey = `${fromIndex}|${toIndex}`;
        if (!geometryByEdge.has(edgeKey)) {
          const fromLocation = {
            lat: from.home.latitude,
            lng: from.home.longitude,
          };
          const toLocation = to
            ? { lat: to.home.latitude, lng: to.home.longitude }
            : office;
          missingEdges.set(edgeKey, {
            key: edgeKey,
            fromIndex,
            toIndex,
            from: fromLocation,
            to: toLocation,
          });
        }
        return null;
      },
    });

    if (missingEdges.size === 0) return planned;
    fetchedEdgeCount += missingEdges.size;
    if (fetchedEdgeCount > maxEdgeCount) {
      throw new Error("Corridor road-index planning exceeded its finite edge bound.");
    }

    const fetched = await mapWithConcurrency(
      [...missingEdges.values()],
      4,
      async (edge) => {
        let line: Array<{ lat: number; lng: number }> | null = null;
        try {
          const result = await getRoutePolyline(edge.from, edge.to, {
            initialBearingDeg: bearingDegrees(edge.from, edge.to),
          });
          if (result.length >= 2) line = result;
        } catch {
          // The pure core applies its straight-line fallback for failed legs.
        }
        return { edge, line };
      }
    );

    for (const { edge, line } of fetched) {
      geometryByEdge.set(edge.key, line);
      if (!line) continue;
      for (const member of members) {
        roadIndex.set(
          legRoadKey(member.matrixIndex, edge.fromIndex, edge.toIndex),
          distanceToPolylineKm(
            { lat: member.home.latitude, lng: member.home.longitude },
            line
          )
        );
      }
    }
  }
}

/**
 * Shared corridor-route builder used by the 11 PM and 12 AM-6 AM algorithms.
 *
 * @param arrivalValue    — the stored weeklyScheduleDay.arrivalTime value in
 *                          "HH:mm" (e.g. "23:00"); the label used on RoutePlan
 *                          ("11 PM") is derived from it.
 * @param shiftKey        — pin key ("11PM" | "12AM-6AM")
 * @param reuse10PM       — prefer this office's 10 PM vehicles (late night)
 * @param completed10PM   — pre-loaded 10 PM route plans for the day (for reuse)
 */
async function generateCorridorRoutes(
  weekStartDate: Date,
  dayOfWeek: number,
  arrivalValue: string,
  shiftKey: ShiftKey,
  reuse10PM: boolean,
  completed10PM: Array<{ id: string; vehicleId: string }>
): Promise<{ routesCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let routesCreated = 0;

  // The human-facing shift label ("11 PM", "12 AM", ...) used for error text
  // and stored on RoutePlan.arrivalTime.
  const arrivalLabel = LABEL_FOR_ARRIVAL_VALUE[arrivalValue] ?? arrivalValue;

  const schedules = (await prisma.weeklyScheduleDay.findMany({
    where: {
      weeklySchedule: { weekStartDate, status: "APPROVED" },
      dayOfWeek: dayOfWeek + 1,
      arrivalTime: arrivalValue,
      needsTransport: true,
    },
    include: {
      weeklySchedule: {
        include: { employee: { include: { homeAddress: true } } },
      },
    },
    // Stable input order → identical plans for identical data.
    orderBy: { id: "asc" },
  })) as unknown as ScheduleAgg[];

  if (schedules.length === 0) return { routesCreated: 0, errors };

  // Learned per-leg medians for this shift (from historical pickup gaps).
  const learned = await loadLearnedLegs(shiftKey);

  const employeesByOffice = new Map<string, ScheduleAgg[]>();
  for (const schedule of schedules) {
    const officeKey = normalizeOfficeLocation(
      schedule.weeklySchedule.employee.officeLocation
    );
    const bucket = employeesByOffice.get(officeKey);
    if (bucket) bucket.push(schedule);
    else employeesByOffice.set(officeKey, [schedule]);
  }

  // Independent reads in parallel. Vehicles are ordered so "next free
  // vehicle" picks are deterministic run to run (not DB-return order).
  const [allVehicles, pinnedIds, presetOwnerRows] = await Promise.all([
    prisma.vehicle.findMany({
      where: { isActive: true },
      select: { id: true, officeLocation: true, capacity: true },
      orderBy: [{ vehicleNumber: "asc" }, { id: "asc" }],
    }) as Promise<VehiclePoolShape[]>,
    pinnedVehicleIdsForShift(weekStartDate, shiftKey),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      distinct: ["vehicleId"],
      select: { vehicleId: true },
    }),
  ]);

  // Vehicles that own active pickup points are 10 PM PRESET vehicles. Under
  // STRICT shift separation a dynamic (home-address) shift must never borrow
  // them: a 10 PM vehicle with a fixed pickup sequence silently swallowing
  // 11 PM / late-night riders is exactly the "forcefully reassigned, main
  // route changed" symptom. A preset-owning vehicle may only serve a dynamic
  // shift when it is EXPLICITLY pinned for that shift in Route Setting.
  const presetOwnerIds = new Set(presetOwnerRows.map((r) => r.vehicleId));

  // STRICT shift separation: a vehicle that owns a preset 10 PM pickup
  // sequence may serve a corridor (11 PM / 12 AM-6 AM) shift ONLY when it is
  // explicitly pinned for that shift. This eligible set drives BOTH the office
  // pool AND planCorridorRoutes' internal all-vehicle fallback, so unpinned
  // preset owners can never be pulled in no matter the pool state. Corridor
  // riders therefore get a NEW or free office vehicle, never a vehicle whose
  // fixed 10 PM route would be changed by the assignment.
  const corridorEligibleVehicles = allVehicles.filter(
    (v) => !presetOwnerIds.has(v.id) || pinnedIds.includes(v.id)
  );

  const dayDate = addUtcCalendarDays(weekStartDate, dayOfWeek);
  const arrivalMinutes = arrivalMinutesFromLabel(arrivalLabel);

  for (const [officeKey, officeSchedules] of employeesByOffice) {
    const office = officeCoordinatesFor(officeKey);

    // Vehicle pool for this office: pinned (exclusive) → dedicated (non-10 PM)
    // office vehicles (see corridorEligibleVehicles — preset owners excluded
    // unless pinned for this shift).
    let pool = poolForOfficeCore(
      officeKey,
      corridorEligibleVehicles,
      pinnedIds,
      (vehicleOffice, key) => normalizeOfficeLocation(vehicleOffice) === key
    );
    const reuseById = new Map<string, string | null>();
    if (reuse10PM) {
      const completedForOffice = completed10PM.map((plan) => {
        const vehicle = corridorEligibleVehicles.find((v) => v.id === plan.vehicleId);
        return vehicle && normalizeOfficeLocation(vehicle.officeLocation) === officeKey
          ? { vehicle, previousId: plan.id }
          : null;
      }).filter((x): x is { vehicle: VehiclePoolShape; previousId: string } => Boolean(x));

      const reused = pinnedIds.length > 0
        ? completedForOffice.filter((r) => pinnedIds.includes(r.vehicle.id))
        : [];
      if (reused.length > 0) {
        pool = [...new Map(reused.map((r) => [r.vehicle.id, r.vehicle])).values()];
        for (const r of reused) reuseById.set(r.vehicle.id, r.previousId);
      }
    }

    if (pool.length === 0) {
      errors.push(
        `${arrivalLabel}: no active vehicles for the ${officeKey} office`
      );
      continue;
    }

    // Resolve home coordinates (auto-geocoding best-effort).
    const members: ClusterMember[] = [];
    for (const schedule of officeSchedules) {
      const employee = schedule.weeklySchedule.employee;
      const home = await resolveHomeAddress(employee);
      if (!home) {
        errors.push(
          `${arrivalLabel}: Employee ${employee.fullName || employee.id} has no geocodable home address`
        );
        continue;
      }
      members.push({
        schedule,
        employee,
        home,
        matrixIndex: 0,
        toOfficeMin: 0,
        toOfficeKm: 0,
      });
    }

    if (members.length === 0) continue;

    // One office's transient failure (DB pooler blip, OSRM outage) must never
    // kill the whole shift — the office is reported and the remaining offices
    // still map. Availability derailed days for this exact reason before: a
    // single Neon/OSRM hiccup aborted the ENTIRE day's corridor pass.
    try {
      // One OSRM matrix: office + all homes (cached 30 days by pair).
      const locations: Location[] = [office];
      for (const m of members) {
        m.matrixIndex = locations.length;
        locations.push({
          lat: m.home.latitude,
          lng: m.home.longitude,
          name: m.employee.id,
        });
      }
    let matrix: Awaited<ReturnType<typeof getDistanceMatrix>>;
    try {
      matrix = await getDistanceMatrix(locations, locations);
    } catch {
      // OSRM outage (table call) — swap in a great-circle matrix (25 km/h, the
      // same estimate the matrix readers already use for missing legs) so the
      // whole day stays mappable instead of killing every corridor route for
      // it. Rounding/precision degrade; availability never does.
      errors.push(
        `${arrivalLabel}: OSRM distance matrix unavailable for ${officeKey}; approximate distances are being used.`
      );
      matrix = {
        originAddresses: [],
        destinationAddresses: [],
        status: "OK",
        rows: locations.map((from) => ({
          elements: locations.map((to) => {
            const km = haversineDistance(from.lat, from.lng, to.lat, to.lng);
            const minutes = (km / 25) * 60;
            return {
              distance: {
                value: Math.max(1, Math.round(km * 1000)),
                text: `${km.toFixed(1)} km`,
              },
              duration: {
                value: Math.max(1, Math.round(minutes * 60)),
                text: `${Math.round(minutes)} min`,
              },
              status: "NoSegment",
            };
          }),
        })),
      };
    }
    const dMin = (from: number, to: number) =>
      matrixDurationMin(matrix, locations, from, to);
    const dKm = (from: number, to: number) =>
      matrixDistanceKm(matrix, locations, from, to);

    for (const m of members) m.toOfficeMin = dMin(m.matrixIndex, 0);
    // Far-first ordering metric: road km from the distance matrix.
    for (const m of members) m.toOfficeKm = dKm(m.matrixIndex, 0);

    // Warm persisted polylines before the pure core asks for missing edges —
    // ONE batched query instead of a DB round-trip per leg during the sweep.
    // Seeded entries are byte-identical to per-leg lookups/OSRM results, so
    // planning judgments are unchanged; only fetch latency is removed (re-runs
    // and post-restart runs skip OSRM entirely).
    const sweepLocations: Location[] = [
      office,
      ...members.map((m) => ({
        lat: m.home.latitude,
        lng: m.home.longitude,
      })),
    ];
    const warmKeys: PolylineWarmKey[] = [];
    for (const a of sweepLocations) {
      for (const b of sweepLocations) {
        if (a === b) continue;
        warmKeys.push({
          from: a,
          to: b,
          initialBearingDeg: bearingDegrees(a, b),
        });
      }
    }
    // Best-effort cache warm — a routing outage here must NOT block mapping.
    // The iterative core adapter below still fetches any required cache misses.
    try {
      await warmPolylineCache(warmKeys);
      // Self-hosted OSRM: fetch the remaining cold legs in parallel up front
      // instead of one-by-one inside the sweep (no-op on the rate-limited
      // public server, where requests must stay spaced out).
      await prefetchRoutePolylines(warmKeys);
    } catch {
      // silent — precision/availability degrade per-leg, never globally
    }

    const planned = await planCorridorRoutesWithRoadIndex({
      members,
      pool,
      allVehicles: corridorEligibleVehicles,
      officeKey,
      office,
      arrivalLabel,
      dMin,
      dKm,
    });
    errors.push(...planned.errors);

    // Prefetch every planned vehicle's learned template and existing plan
    // for this day/shift in two queries (was: two lookups per route).
    const plannedVehicleIds = planned.routes.map((r) => r.vehicle.id);
    const [templateRows, existingPlanRows] = await Promise.all([
      prisma.routeTemplate.findMany({
        where: { arrivalTime: arrivalLabel, vehicleId: { in: plannedVehicleIds } },
        select: {
          vehicleId: true,
          stops: {
            orderBy: { seq: "asc" },
            select: { employeeId: true, pickupTime: true },
          },
        },
      }),
      prisma.routePlan.findMany({
        where: { dayDate, arrivalTime: arrivalLabel, vehicleId: { in: plannedVehicleIds } },
        select: { id: true, status: true, vehicleId: true },
      }),
    ]);
    const templateByVehicle = new Map(templateRows.map((t) => [t.vehicleId, t]));
    const existingPlanByVehicle = new Map(existingPlanRows.map((p) => [p.vehicleId, p]));

    for (let planIdx = 0; planIdx < planned.routes.length; planIdx++) {
      try {
        const { order: plannedOrder, vehicle } = planned.routes[planIdx];
        let order = plannedOrder;

        // Replay the learned route pattern (tuned sequence AND the finalized
        // pickup times captured at the previous finalize of this vehicle +
        // arrival time): pattern riders ride first in the learned order with
        // their FINALIZED pickup times replayed verbatim; new riders (not in
        // the pattern) ride after in their planned order.
        const template = templateByVehicle.get(vehicle.id) ?? null;
        const finalizedMinutes = new Map<string, number>();
        if (template && template.stops.length > 0) {
          for (const stop of template.stops) {
            if (!stop.employeeId || !stop.pickupTime) continue;
            const m = timeStringToMinutes(stop.pickupTime);
            if (Number.isFinite(m)) finalizedMinutes.set(stop.employeeId, m);
          }
          const replayed = patternOrderForMembers(
            template.stops.map((s) => s.employeeId),
            order,
            (m) => m.employee.id
          );
          if (replayed.replayed) order = replayed.order;
        }

        const previousRoutePlanId = reuseById.get(vehicle.id) ?? null;

        // FINALIZE-FIRST TIMING: pickup times come from the FINALIZED route
        // first — riders captured in the template keep their finalized pickup
        // times, replayed verbatim. Trained legs (RouteLegLearning) are only
        // consulted for NEW riders appended after the finalized pattern. No
        // distance/OSRM estimate fallback: an untrained leg for a new rider
        // errors THIS route only and the rest of the mapping proceeds.
        const prefixCount = (() => {
          let n = 0;
          while (n < order.length && finalizedMinutes.has(order[n].employee.id)) n++;
          return n;
        })();
        const tail = order.slice(prefixCount);
        const anchor = tail.length === 0 ? null : order[prefixCount - 1];

        // Leg drive time — trained only, for the tail chain (last finalized
        // stop → first tail stop, tail stop → tail stop, last tail stop →
        // office).
        const officeKeyStr = `office:${office.name}`;
        const legMin = (
          from: ClusterMember | null,
          to: ClusterMember | null
        ): number | null => {
          const f = from ? `addr:${from.home.id}` : officeKeyStr;
          const t = to ? `addr:${to.home.id}` : officeKeyStr;
          const hit = learned.get(`${f}->${t}`);
          if (
            hit &&
            hit.sampleCount >= LEARN_MIN_SAMPLES &&
            Number.isFinite(hit.avgMinutes) &&
            hit.avgMinutes > 0
          ) {
            return Math.max(1, Math.round(hit.avgMinutes));
          }
          return null;
        };
        const memberName = (m: ClusterMember) =>
          m.employee.fullName || `addr:${m.home.id}`;

        let pickupMinutes: number[];
        let departureMinutes: number;

        if (tail.length === 0) {
          // Every rider was finalized: replay their stored pickup times
          // verbatim — no trained data needed, nothing invented.
          pickupMinutes = order.map((m) => finalizedMinutes.get(m.employee.id)!);
          departureMinutes = pickupMinutes[0] ?? arrivalMinutes;
        } else {
          // Finalized prefix stays verbatim; the appended tail is back-
          // calculated from the arrival along its own trained legs.
          const anchorMember = anchor as ClusterMember;
          const tailLegs: Array<number | null> = [legMin(anchorMember, tail[0])];
          const tailLegNames: Array<string> = [
            `${memberName(anchorMember)} → ${memberName(tail[0])}`,
          ];
          for (let i = 0; i < tail.length - 1; i++) {
            tailLegs.push(legMin(tail[i], tail[i + 1]));
            tailLegNames.push(`${memberName(tail[i])} → ${memberName(tail[i + 1])}`);
          }
          tailLegs.push(legMin(tail[tail.length - 1], null));
          tailLegNames.push(`${memberName(tail[tail.length - 1])} → ${office.name}`);

          const missing = tailLegNames.filter((_, i) => tailLegs[i] == null);
          if (missing.length > 0) {
            throw new Error(
              `no finalized/taught drive time yet for ${missing.join(
                "; "
              )} — the riders before these are replayed from the finalized route; new riders need trained gaps (≥ ${LEARN_MIN_SAMPLES} observations; finalize this route or use \"Teach from manual plan\")`
            );
          }

          // Chain is [anchor → t1 → … → tN → office]: the first derived value
          // is the anchor's own (ignored); indices 1..N are the tail pickups.
          const derived = backCalculatePickupMinutes(
            arrivalMinutes,
            tailLegs as number[]
          );
          const tailPickups = derived.slice(1);
          const lastFinalizedPickup = finalizedMinutes.get(anchorMember.employee.id)!;
          if (
            tailPickups.length > 0 &&
            tailPickups[0] <= lastFinalizedPickup + PICKUP_GRID_MINUTES - 1
          ) {
            tailPickups[0] = lastFinalizedPickup + PICKUP_GRID_MINUTES;
          }
          pickupMinutes = [
            ...order
              .slice(0, prefixCount)
              .map((m) => finalizedMinutes.get(m.employee.id)!),
            ...tailPickups,
          ];
          departureMinutes = pickupMinutes[0] ?? arrivalMinutes;
        }
        const pickupTimes = pickupMinutes.map(minutesToTimeString);

        // Idempotency over previously committed runs (see the 10 PM path): a
        // FINALIZED/EXECUTED plan for this vehicle+day+shift stays untouched;
        // older drafts are replaced so re-runs produce a clean sheet. The
        // (dayDate, vehicleId, arrivalTime) unique key would otherwise reject
        // the create below.
        const existingPlan = existingPlanByVehicle.get(vehicle.id) ?? null;
        if (existingPlan) {
          if (
            existingPlan.status === "FINALIZED" ||
            existingPlan.status === "EXECUTED"
          ) {
            errors.push(
              `${arrivalLabel}: vehicle ${vehicle.id} already has a locked ${existingPlan.status} route for this day — skipped (route kept intact)`
            );
            continue;
          }
        }

        // Plan + all riders in ONE nested write, and the old draft is
        // replaced in the same transaction — a failure can never leave a
        // half-populated DRAFT route (it would look valid but silently miss
        // employees), so no compensating delete is needed.
        const assignedAt = new Date();
        const createPlan = prisma.routePlan.create({
          data: {
            weekStartDate,
            dayOfWeek,
            dayDate,
            vehicleId: vehicle.id,
            arrivalTime: arrivalLabel,
            routeType: "DYNAMIC_11PM_PLUS",
            status: "DRAFT",
            departureTime: dateForArrivalMinutes(dayDate, departureMinutes),
            estimatedCompletionTime: dateForArrivalMinutes(
              dayDate,
              arrivalMinutes
            ),
            officeLocation: office.name,
            destinationLat: office.lat,
            destinationLng: office.lng,
            previousRoutePlanId,
            createdById: "system",
            tripAssignments: {
              createMany: {
                data: order.map((m, i) => ({
                  weeklyScheduleDayId: m.schedule.id,
                  employeeId: m.employee.id,
                  vehicleId: vehicle.id,
                  pickupType: "HOME_ADDRESS",
                  pickupAddressId: m.home.id,
                  pickupTime: pickupTimes[i],
                  sequenceInTrip: i + 1,
                  assignedAt,
                })),
              },
            },
          },
          select: { id: true },
        });
        if (existingPlan) {
          await prisma.$transaction([
            prisma.routePlan.delete({ where: { id: existingPlan.id }, select: { id: true } }),
            createPlan,
          ]);
        } else {
          await createPlan;
        }

        routesCreated++;
      } catch (error) {
        errors.push(
          `${arrivalLabel} route ${planIdx + 1} (vehicle ${
            planned.routes[planIdx].vehicle.id
          }): ${errorMessage(error)}`
        );
      }
    }
    } catch (officeError) {
      errors.push(
        `${arrivalLabel}: ${officeKey} office failed to map (${errorMessage(officeError)})`
      );
      continue;
    }
  }

  return { routesCreated, errors };
}

/**
 * Algorithm B: 11 PM routes — corridor path routing per office, arrive by
 * 11 PM, max 6 per vehicle (pinned vehicles respected).
 */
export async function generate11PMRoutes(
  weekStartDate: Date,
  dayOfWeek: number
): Promise<RouteGenerationResult> {
  const errors: string[] = [];
  try {
    const completed10PM = await prisma.routePlan.findMany({
      where: {
        weekStartDate,
        dayOfWeek,
        arrivalTime: "10 PM",
        status: { in: ["DRAFT", "FINALIZED"] },
      },
      select: { id: true, vehicleId: true },
    });

    const result = await generateCorridorRoutes(
      weekStartDate,
      dayOfWeek,
      "23:00",
      "11PM",
      true,
      completed10PM
    );
    return { success: true, routesCreated: result.routesCreated, errors: [...errors, ...result.errors] };
  } catch (error) {
    errors.push(
      `11 PM route generation failed: ${
        errorMessage(error)
      }`
    );
    return { success: false, routesCreated: 0, errors };
  }
}

/**
 * Algorithm C: 12 AM-6 AM routes — same corridor clustering per late-night
 * shift, reusing the day's 10 PM vehicles (rested) and respecting pins.
 */
export async function generate12AMPlus6AMRoutes(
  weekStartDate: Date,
  dayOfWeek: number
): Promise<RouteGenerationResult> {
  const errors: string[] = [];
  let routesCreated = 0;

  try {
    const completed10PM = await prisma.routePlan.findMany({
      where: {
        weekStartDate,
        dayOfWeek,
        arrivalTime: "10 PM",
        status: { in: ["DRAFT", "FINALIZED"] },
      },
      select: { id: true, vehicleId: true },
    });

    for (const shift of ARRIVAL_TIMES_BY_SHIFT["12AM-6AM"]) {
      const result = await generateCorridorRoutes(
        weekStartDate,
        dayOfWeek,
        shift,
        "12AM-6AM",
        true,
        completed10PM
      );
      routesCreated += result.routesCreated;
      errors.push(...result.errors);
    }

    return { success: true, routesCreated, errors };
  } catch (error) {
    errors.push(
      `12 AM-6 AM route generation failed: ${
        errorMessage(error)
      }`
    );
    return { success: false, routesCreated, errors };
  }
}