/**
 * Core route generation algorithms (OSRM / OpenStreetMap based — no API keys).
 *
 *  - 10 PM: Preset pickup-point sequences — employees match a vehicle when
 *           their pickup point is one of that vehicle's points.
 *  - 11 PM: Density clustering — groups up to 4 nearby passengers per vehicle
 *           (farthest-from-office forms each group first), then orders each
 *           vehicle's pickups far → office. Pickup times back-calculated so
 *           the vehicle reaches the office by 11 PM.
 *  - 12 AM-6 AM: Same density clustering per late-night shift, reusing the
 *           10 PM vehicles after a rest period.
 *
 * Every route's LAST destination is the vehicle's office (RoutePlan snapshots
 * officeLocation + destinationLat/Lng). Employees are served by vehicles of
 * their own office (User.officeLocation matches Vehicle.officeLocation).
 */

import { prisma } from "@/lib/prisma";
import { getDistanceMatrix, Location } from "./osrm";
import { geocodeAddress } from "./geocoder";
import {
  haversineDistance,
  minutesToTimeString,
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
  computePickupSchedule,
  loadLearnedLegs,
  snapPickupMinutesDown,
  PICKUP_GRID_MINUTES,
  LEARN_MIN_SAMPLES,
} from "./pickup-schedule";

export interface RouteGenerationResult {
  success: boolean;
  routesCreated: number;
  errors: string[];
}

export const SHIFT_KEYS = ["10PM", "11PM", "12AM-6AM"] as const;
export type ShiftKey = (typeof SHIFT_KEYS)[number];

/** Dynamic (11 PM / late-night) shared-ride rules. */
const DYNAMIC_GROUP_CAPACITY = 4;
/** Homes within this straight-line radius of the growing group share a
 * vehicle — nearby addresses ride together. Anyone farther is left for a
 * later vehicle. */
const GROUPING_RADIUS_KM = 2.0;
/** A member may sit up to this far (km) beyond the group's anchor in
 * straight-line distance-from-office and still join — the far-first ordering
 * then walks the route back toward the office. */
const GROUPING_OFFICE_DIRECTION_SLACK_KM = 1.0;

/**
 * Minutes-from-midnight when a vehicle must arrive at the office for a given
 * arrival label. Late-night labels (12 AM-6 AM) fall on the following calendar
 * day, so they are expressed as 1440 + shift minutes.
 */
function arrivalMinutesFromLabel(arrivalTime: string): number {
  const normalized = (arrivalTime || "").toUpperCase().replace(/\s+/g, "");
  const map: Record<string, number> = {
    "10PM": 22 * 60,
    "11PM": 23 * 60,
    "12AM": 24 * 60,
    "1AM": 25 * 60,
    "2AM": 26 * 60,
    "3AM": 27 * 60,
    "4AM": 28 * 60,
    "5AM": 29 * 60,
    "6AM": 30 * 60,
  };
  return map[normalized] ?? 23 * 60;
}

/** Convert minutes-from-midnight into a Date anchored on `dayDate`. */
function dateForArrivalMinutes(dayDate: Date, minutes: number): Date {
  const d = new Date(dayDate);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/** Parse a "HH:mm" clock time into minutes-from-midnight (null if invalid). */
function hhmmToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

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

type HomeAddressShape = {
  id: string;
  addressText: string;
  latitude: number;
  longitude: number;
};

type EmployeeShape = {
  id: string;
  fullName: string;
  address: string | null;
  homeAddressId: string | null;
  officeLocation: string | null;
  pickupAddressId: string | null;
  homeAddress: HomeAddressShape | null;
  pickupAddress: HomeAddressShape | null;
};

type ScheduleAgg = {
  id: string;
  dayOfWeek: number;
  arrivalTime: string | null;
  weeklySchedule: { weekStartDate: Date; employee: EmployeeShape };
};

/** Resolve an employee's home address, auto-geocoding their free-text address
 * via OpenStreetMap when coordinates are missing (best effort). */
async function resolveHomeAddress(
  employee: EmployeeShape
): Promise<HomeAddressShape | null> {
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

/** Read a travel duration (minutes, minimum 1) from an OSRM matrix response,
 * falling back to a great-circle estimate when a leg is missing. */
function matrixDurationMin(
  matrix: Awaited<ReturnType<typeof getDistanceMatrix>>,
  locations: Location[],
  fromIdx: number,
  toIdx: number
): number {
  const element = matrix.rows?.[fromIdx]?.elements?.[toIdx];
  if (element && element.duration.value > 0) {
    return Math.max(1, element.duration.value / 60);
  }
  const from = locations[fromIdx];
  const to = locations[toIdx];
  if (!from || !to) return 1;
  const km = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  return Math.max(1, (km / 25) * 60);
}

type ClusterMember = {
  schedule: ScheduleAgg;
  employee: EmployeeShape;
  home: HomeAddressShape;
  matrixIndex: number; // index within the [office, ...homes] matrix
  toOfficeMin: number;
};

/**
 * Density clustering: start at the member FARTHEST from the office, then keep
 * adding the remaining member whose home is NEAREST to the group already built
 * (nearby addresses ride together). A member is left for a later vehicle when
 * no home sits within `maxGroupRadiusKm` of the group — so vehicles don't
 * always fill up. Members are also kept office-directed (never much farther
 * out than the group's anchor), so the group reads as one route back.
 */
function corridorClusters(
  members: ClusterMember[],
  cap: number,
  maxGroupRadiusKm: number,
  office: OfficeCoords
): ClusterMember[][] {
  const remaining = [...members].sort((a, b) => b.toOfficeMin - a.toOfficeMin);
  const groups: ClusterMember[][] = [];

  while (remaining.length > 0) {
    const anchor = remaining.shift()!;
    const group: ClusterMember[] = [anchor];
    const anchorToOfficeKm = haversineDistance(
      anchor.home.latitude,
      anchor.home.longitude,
      office.lat,
      office.lng
    );

    while (group.length < cap && remaining.length > 0) {
      let best: ClusterMember | null = null;
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const m = remaining[i];
        const mToOfficeKm = haversineDistance(
          m.home.latitude,
          m.home.longitude,
          office.lat,
          office.lng
        );
        if (
          mToOfficeKm >
          anchorToOfficeKm + GROUPING_OFFICE_DIRECTION_SLACK_KM
        ) {
          continue;
        }

        let dist = Infinity;
        for (const g of group) {
          dist = Math.min(
            dist,
            haversineDistance(
              g.home.latitude,
              g.home.longitude,
              m.home.latitude,
              m.home.longitude
            )
          );
        }
        if (dist < bestDist) {
          bestDist = dist;
          best = m;
          bestIdx = i;
        }
      }

      if (!best || bestDist > maxGroupRadiusKm) break;
      group.push(best);
      remaining.splice(bestIdx, 1);
    }

    groups.push(group);
  }

  return groups;
}

type VehiclePoolShape = {
  id: string;
  officeLocation: string;
  capacity: number;
};

/** Pick a vehicle pool for one office (pinned vehicles take priority). */
function poolForOffice(
  officeKey: string,
  allVehicles: VehiclePoolShape[],
  pinnedIds: string[]
): VehiclePoolShape[] {
  const officeVehicles = allVehicles.filter(
    (v) => normalizeOfficeLocation(v.officeLocation) === officeKey
  );
  if (pinnedIds.length === 0) return officeVehicles;
  const pinned = officeVehicles.filter((v) => pinnedIds.includes(v.id));
  return pinned.length > 0 ? pinned : officeVehicles;
}

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
    })) as unknown as ScheduleAgg[];

    if (schedules.length === 0) {
      return { success: true, routesCreated: 0, errors };
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
      const pickupPoint = employee.pickupAddressId
        ? await prisma.pickupPoint.findFirst({
            where: {
              addressId: employee.pickupAddressId,
              isActive: true,
            },
            include: { vehicle: true },
          })
        : null;

      if (!pickupPoint) {
        errors.push(
          `Employee ${employee.fullName || employee.id} has no matching 10 PM pickup point`
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
        const pickupPoints = await prisma.pickupPoint.findMany({
          where: { vehicleId, isActive: true },
          include: { address: true },
          orderBy: { sequence: "asc" },
        });

        // ===== SCHEDULED PICKUP TIMES =====
        // The vehicle's first pickup time (set by Facilities) anchors the
        // schedule forward; remaining points are previous + drive (5 min/km or
        // a learned average from history), office arrival is derived — always
        // on a 5-minute grid with >= 5 min between consecutive pickups. When
        // no first pickup time is set, the vehicle's BASE ETA anchors the
        // schedule backward. This is the exact rule used by "Set pickup times"
        // / route-setting sync, so the generated schedule always matches what
        // Facilities configured.
        const learned10PM = await loadLearnedLegs("10PM");
        const vehicleRow = await prisma.vehicle.findUnique({
          where: { id: vehicleId },
          select: { vehicleNumber: true, firstPickupTime: true, baseETA: true },
        });
        const office = officeCoordinatesFor(group.office);
        const schedule = computePickupSchedule(
          {
            firstPickupTime: vehicleRow?.firstPickupTime ?? null,
            baseETA: vehicleRow?.baseETA ?? null,
          },
          pickupPoints.map((p) => ({
            id: p.id,
            name: p.name,
            latitude: p.address?.latitude ?? null,
            longitude: p.address?.longitude ?? null,
            key: p.address ? `addr:${p.address.id}` : null,
          })),
          office,
          learned10PM
        );
        if (!schedule.success) {
          errors.push(
            `Vehicle ${vehicleRow?.vehicleNumber || vehicleId}: ${
              schedule.error
            }`
          );
          continue;
        }
        const pickupByPointId = new Map(
          schedule.points.map((u) => [u.id, u.pickup])
        );

        const dayDate = new Date(weekStartDate);
        dayDate.setDate(dayDate.getDate() + dayOfWeek);

        const entries: Array<{
          schedule: ScheduleAgg;
          pickupPointId: string;
          pointSequence: number;
          pickupTime: string;
        }> = [];

        for (const scheduleEntry of group.schedules) {
          const employee = scheduleEntry.weeklySchedule.employee;
          const pickupPoint = pickupPoints.find(
            (p) => p.addressId === employee.pickupAddressId
          );
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

        const completionMinutes = hhmmToMinutes(schedule.officeArrival);

        const departureTime10 = new Date(dayDate);
        departureTime10.setHours(20, 0, 0, 0);

        const routePlan = await prisma.routePlan.create({
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
          },
        });

        let sequenceCount = 0;
        for (const entry of entries) {
          sequenceCount++;
          await prisma.tripAssignment.create({
            data: {
              routePlanId: routePlan.id,
              weeklyScheduleDayId: entry.schedule.id,
              employeeId: entry.schedule.weeklySchedule.employee.id,
              vehicleId,
              pickupType: "PRESET_POINT",
              pickupPointId: entry.pickupPointId,
              pickupTime: entry.pickupTime,
              sequenceInTrip: sequenceCount,
              assignedAt: new Date(),
            },
          });
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

/** Best-effort human-readable message from any thrown value (including DOM /
 * fetch `ErrorEvent` objects that aren't `Error` instances). */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || String(error);
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.length > 0
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
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

  const allVehicles: VehiclePoolShape[] = await prisma.vehicle.findMany({
    where: { isActive: true },
    select: { id: true, officeLocation: true, capacity: true },
  });
  const pinnedIds = await pinnedVehicleIdsForShift(weekStartDate, shiftKey);

  const dayDate = new Date(weekStartDate);
  dayDate.setDate(dayDate.getDate() + dayOfWeek);
  const arrivalMinutes = arrivalMinutesFromLabel(arrivalLabel);

  for (const [officeKey, officeSchedules] of employeesByOffice) {
    const office = officeCoordinatesFor(officeKey);

    // Vehicle pool for this office: pinned (exclusive) → 10 PM reuse (late
    // night) → all office vehicles.
    let pool = poolForOffice(officeKey, allVehicles, pinnedIds);
    const reuseById = new Map<string, string | null>();
    if (reuse10PM && pool.every((v) => !pinnedIds.includes(v.id))) {
      const reused = completed10PM.map((plan) => {
        const vehicle = allVehicles.find((v) => v.id === plan.vehicleId);
        return vehicle && normalizeOfficeLocation(vehicle.officeLocation) === officeKey
          ? { vehicle, previousId: plan.id }
          : null;
      }).filter((x): x is { vehicle: VehiclePoolShape; previousId: string } => Boolean(x));
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
      });
    }

    if (members.length === 0) continue;

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
    const matrix = await getDistanceMatrix(locations, locations);
    const dMin = (from: number, to: number) =>
      matrixDurationMin(matrix, locations, from, to);

    for (const m of members) m.toOfficeMin = dMin(m.matrixIndex, 0);

    const groups = corridorClusters(
      members,
      DYNAMIC_GROUP_CAPACITY,
      GROUPING_RADIUS_KM,
      office
    );

    // A vehicle can run at most once per shift per day (enforced by the
    // unique (dayDate, vehicleId, arrivalTime) constraint).
    const usedVehicleIds = new Set<string>();

    for (let gi = 0; gi < groups.length; gi++) {
      // Created inside the try so a mid-way failure can roll it back; a
      // half-populated DRAFT route would otherwise look valid but silently
      // miss employees.
      let createdRoutePlanId: string | null = null;

      try {
        const group = groups[gi];

        // When the pin / 10 PM-reuse pool runs out, fall back to the office's
        // other vehicles so later groups still get a bus instead of crashing
        // or recycling a vehicle that is already used for this shift.
        let vehicle: VehiclePoolShape | null = pool[gi % pool.length];
        if (usedVehicleIds.has(vehicle.id)) {
          const spare = [...pool, ...allVehicles].find(
            (v) =>
              !usedVehicleIds.has(v.id) &&
              normalizeOfficeLocation(v.officeLocation) === officeKey
          );
          vehicle = spare ?? null;
        }
        if (!vehicle) {
          errors.push(
            `${arrivalLabel}: ${groups.length} groups but no spare vehicle for the ${officeKey} office`
          );
          continue;
        }
        usedVehicleIds.add(vehicle.id);
        const previousRoutePlanId = reuseById.get(vehicle.id) ?? null;

        // Route order: farthest-from-office member is picked up FIRST, then
        // the rest in descending travel-time back to the office. Deterministic
        // (no per-run OSRM dependency, matches how the schedule is reviewed).
        const order = [...group].sort(
          (a, b) => b.toOfficeMin - a.toOfficeMin
        );

        // Leg drive time: a learned average (>= 3 observations) wins over the
        // raw OSRM duration, keeping the schedule stable once the planner is
        // trained on how a leg actually runs.
        const officeKeyStr = `office:${office.name}`;
        const legMin = (
          from: ClusterMember | null,
          to: ClusterMember | null,
          fallback: number
        ) => {
          const f = from ? `addr:${from.home.id}` : officeKeyStr;
          const t = to ? `addr:${to.home.id}` : officeKeyStr;
          const hit = learned.get(`${f}->${t}`);
          if (hit && hit.sampleCount >= LEARN_MIN_SAMPLES) {
            return Math.max(1, Math.round(hit.avgMinutes));
          }
          return fallback;
        };

        const legs: number[] = [
          legMin(null, order[0], dMin(0, order[0].matrixIndex)),
        ];
        for (let i = 0; i < order.length - 1; i++) {
          legs.push(
            legMin(
              order[i],
              order[i + 1],
              dMin(order[i].matrixIndex, order[i + 1].matrixIndex)
            )
          );
        }
        legs.push(
          legMin(order[order.length - 1], null, dMin(order[order.length - 1].matrixIndex, 0))
        );

        const totalTravel = legs.reduce((a, b) => a + b, 0);
        const departureMinutes = Math.max(0, arrivalMinutes - totalTravel);

        // Back-calculated pickup times on the 5-minute grid: the last pickup
        // is at least 5 min before arrival, every earlier pickup >= 5 min
        // before the next — the late-night (11 PM-6 AM) home-to-home spacing
        // Facilities asked for. Times wrap past midnight for late shifts.
        const rawPickup: number[] = new Array(order.length);
        rawPickup[order.length - 1] = arrivalMinutes - legs[order.length];
        for (let i = order.length - 2; i >= 0; i--) {
          rawPickup[i] = rawPickup[i + 1] - legs[i + 1];
        }
        if (rawPickup[0] < 0) {
          throw new Error(
            `route from ${order.length} homes takes ${totalTravel} min — more than the ${arrivalLabel} window allows (${arrivalLabel} arrival cannot be kept).`
          );
        }
        const pickupMinutes: number[] = new Array(order.length);
        pickupMinutes[order.length - 1] = snapPickupMinutesDown(
          rawPickup[order.length - 1]
        );
        for (let i = order.length - 2; i >= 0; i--) {
          const maxAllowed = Math.min(
            rawPickup[i],
            pickupMinutes[i + 1] - PICKUP_GRID_MINUTES
          );
          pickupMinutes[i] = snapPickupMinutesDown(maxAllowed);
        }
        const pickupTimes = pickupMinutes.map(minutesToTimeString);

        const routePlan = await prisma.routePlan.create({
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
          },
        });
        createdRoutePlanId = routePlan.id;

        for (let i = 0; i < order.length; i++) {
          const m = order[i];
          await prisma.tripAssignment.create({
            data: {
              routePlanId: routePlan.id,
              weeklyScheduleDayId: m.schedule.id,
              employeeId: m.employee.id,
              vehicleId: vehicle.id,
              pickupType: "HOME_ADDRESS",
              pickupAddressId: m.home.id,
              pickupTime: pickupTimes[i],
              sequenceInTrip: i + 1,
              assignedAt: new Date(),
            },
          });
        }

        routesCreated++;
      } catch (error) {
        if (createdRoutePlanId) {
          await prisma.routePlan
            .delete({ where: { id: createdRoutePlanId } })
            .catch(() => undefined);
        }
        errors.push(
          `${arrivalLabel} group ${gi + 1}: ${
            errorMessage(error)
          }`
        );
      }
    }
  }

  return { routesCreated, errors };
}

/**
 * Algorithm B: 11 PM routes — corridor clustering per office, arrive by 11 PM,
 * max 4 per vehicle (pinned vehicles respected).
 */
export async function generate11PMRoutes(
  weekStartDate: Date,
  dayOfWeek: number
): Promise<RouteGenerationResult> {
  const errors: string[] = [];
  try {
    const result = await generateCorridorRoutes(
      weekStartDate,
      dayOfWeek,
      "23:00",
      "11PM",
      false,
      []
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