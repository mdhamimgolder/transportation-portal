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

import { prisma } from "@/lib/prisma";
import {
  getDistanceMatrix,
  getRoutePolyline,
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

export interface RouteGenerationResult {
  success: boolean;
  routesCreated: number;
  errors: string[];
}

export const SHIFT_KEYS = ["10PM", "11PM", "12AM-6AM"] as const;
export type ShiftKey = (typeof SHIFT_KEYS)[number];

/** Dynamic (11 PM / late-night) shared-ride rules.
 * Max riders per vehicle — a 10-seater fills to 6, a 4-seater stays at its
 * seats (never more riders than physical capacity). */
export const DYNAMIC_GROUP_CAPACITY = 6;
/** Homes within this straight-line radius of the growing group share a
 * vehicle — nearby addresses ride together. Anyone farther is left for a
 * later vehicle. */
const GROUPING_RADIUS_KM = 2.0;
/** A member may sit up to this far (km) beyond the group's anchor in road
 * distance-from-office and still join — the nearest-hop ordering then walks
 * the route back toward the office, never farther than the anchor (nor more
 * than this beyond the current end stop). */
const GROUPING_OFFICE_DIRECTION_SLACK_KM = 1.0;
/** After a route's path exists, a remaining employee whose home sits within
 * this distance of one of the route's legs' ACTUAL DRIVING geometry (OSRM
 * road polyline) rides that route — instead of getting another vehicle —
 * when the insertion adds at most CORRIDOR_MAX_DETOUR_MIN minutes of detour
 * for the onboard riders. Homes off the road path are skipped: attaching
 * them would change the first-created route. */
const CORRIDOR_ATTACH_KM = 0.8;
/** Hard cap on the road-time detour an attachment may add for the onboard
 * riders, measured with the real OSRM matrix. Calibrated against Facilities'
 * review of the Sep 7 plan: a genuinely on-the-way pickup (Khilkhet into the
 * Dakkhinkhan→Gulshan run) adds ~6.5 min, while a home that forces the vehicle
 * off the created path (Kalachandpur side trip) adds ~7.5 min and must be
 * skipped — it rides another vehicle instead. */
const CORRIDOR_MAX_DETOUR_MIN = 7;
/** When growing a path, the next pickup may not add more than this much ROAD
 * distance over driving straight to the office (end → home → office vs end →
 * office). A home that truly sits on the created path's way detours far less
 * than this and always passes; a house on a dead-end street / side trip (or a
 * barrier reroute) stretches the drawn route instead, so it is skipped here
 * and left for the corridor-attach pass (judged against the real driving
 * geometry) or a later vehicle. */
const GROWTH_MAX_DETOUR_KM = 2;
/** Zigzag guard for path growth: a hop whose ROAD distance exceeds this
 * factor of the straight-line distance crosses a barrier (highway, rail
 * line, lake, one-way loop) — grouping such homes would force the vehicle to
 * detour far around and double back. They wait for a vehicle whose path
 * actually passes them. */
const MAX_ROAD_VS_STRAIGHT = 2.5;

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
  pickupPoint: string | null;
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

/** Read a road distance (km, minimum 0.001) from an OSRM matrix response,
 * falling back to a great-circle distance when a leg is missing. */
function matrixDistanceKm(
  matrix: Awaited<ReturnType<typeof getDistanceMatrix>>,
  locations: Location[],
  fromIdx: number,
  toIdx: number
): number {
  const element = matrix.rows?.[fromIdx]?.elements?.[toIdx];
  if (element && element.distance.value > 0) {
    return Math.max(0.001, element.distance.value / 1000);
  }
  const from = locations[fromIdx];
  const to = locations[toIdx];
  if (!from || !to) return 0.001;
  return Math.max(
    0.001,
    haversineDistance(from.lat, from.lng, to.lat, to.lng)
  );
}

type ClusterMember = {
  schedule: ScheduleAgg;
  employee: EmployeeShape;
  home: HomeAddressShape;
  matrixIndex: number; // index within the [office, ...homes] matrix
  toOfficeMin: number;
  /** Road distance (km) from the home to the office via the distance
   * matrix — the anchor/ordering metric for corridor growth. Road MINUTES can
   * invert for near homes (one-way loops, slow roads), so office-directness is
   * judged by km: the farthest home opens its route, and every further hop may
   * only move toward the office (never farther than the anchor or the current
   * end stop, within the slack). */
  toOfficeKm: number;
};

/** Straight-line distance in km from point `p` to segment `a→b`, using a
 * local equirectangular projection (accurate at Dhaka city scale). */
function distancePointToSegmentKm(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const KM_PER_DEG_LAT = 110.574;
  const cosRef = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const px = p.lng * KM_PER_DEG_LAT * cosRef;
  const py = p.lat * KM_PER_DEG_LAT;
  const ax = a.lng * KM_PER_DEG_LAT * cosRef;
  const ay = a.lat * KM_PER_DEG_LAT;
  const bx = b.lng * KM_PER_DEG_LAT * cosRef;
  const by = b.lat * KM_PER_DEG_LAT;
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/** Straight-line distance in km from point `p` to a road polyline (the min
 * over its segments). Exported for the corridor dry-run tooling. */
export function distancePointToPolylineKm(
  p: { lat: number; lng: number },
  line: Array<{ lat: number; lng: number }>
): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, distancePointToSegmentKm(p, line[i - 1], line[i]));
  }
  return best;
}

export type PlannedCorridorRoute = {
  /** Travel sequence: pickups in visiting order (the vehicle's office is the
   * implicit final destination and is not part of this list). */
  order: ClusterMember[];
  vehicle: VehiclePoolShape;
  capacity: number;
};

/**
 * Path-based corridor planner for the dynamic shifts (11 PM / 12 AM-6 AM).
 *
 * 1. **Nearest-hop paths.** Every route is anchored at the member FARTHEST
 *    from the office by distance-matrix road km — the farthest home is always
 *    picked up first. The path then walks back toward the office one hop at a
 *    time: each stop is the remaining member NEAREST (by road minutes) to the
 *    current end, within `GROUPING_RADIUS_KM`, office-directed within
 *    `GROUPING_OFFICE_DIRECTION_SLACK_KM` of BOTH the anchor and the current
 *    end, and bounded by the zigzag guard (`MAX_ROAD_VS_STRAIGHT`). A
 *    candidate whose pickup would extend the end → office drive by more than
 *    `GROWTH_MAX_DETOUR_KM` of road is SKIPPED instead of lengthening the
 *    drawn route — it waits for the corridor attach or a later vehicle. The
 *    visiting order IS the grown chain and is never re-sorted, so the drawn
 *    direction follows the road corridor.
 * 2. **Corridor attach.** After each path exists, the remaining same-arrival
 *    employees are swept: anyone whose home lies within `CORRIDOR_ATTACH_KM`
 *    of one of the route's driving-geometry legs — and whose insertion there
 *    adds at most `CORRIDOR_MAX_DETOUR_MIN` minutes — is attached AT THAT
 *    LEG. Existing stops keep their exact order (the created route is never
 *    restructured) and the far-first anchor can never be displaced:
 *    attachments start at the leg AFTER the anchor. A home genuinely ON the
 *    drawn route therefore rides this vehicle despite the growth detour
 *    guard — it sits on the way, which is exactly the case that must join.
 *    Anything that does not fit cleanly is left unassigned rather than
 *    changing the created route.
 * 3. **Vehicle consolidation.** Vehicles fill to capacity SEQUENTIALLY: a
 *    second vehicle opens only when no planned route can take another
 *    passenger, so overlapping paths share one vehicle instead of running in
 *    parallel.
 */
export async function planCorridorRoutes(args: {
  members: ClusterMember[];
  pool: VehiclePoolShape[];
  allVehicles: VehiclePoolShape[];
  officeKey: string;
  office: OfficeCoords;
  arrivalLabel: string;
  dMin: (fromIdx: number, toIdx: number) => number;
  /** Road distance (km) between two matrix indices — the zigzag guard for
   * path growth (a hop is skipped when the road is much longer than the
   * straight line, i.e. the homes sit across a barrier / one-way loop). */
  dKm: (fromIdx: number, toIdx: number) => number;
  /** Road distance (km) from a candidate home to the leg's actual driving
   * geometry — decides whether the home truly "follows the created path". */
  legRoadKm: (
    m: ClusterMember,
    from: ClusterMember,
    to: ClusterMember | null
  ) => Promise<number>;
}): Promise<{ routes: PlannedCorridorRoute[]; errors: string[] }> {
  const {
    members,
    pool,
    allVehicles,
    officeKey,
    arrivalLabel,
    dMin,
    dKm,
    legRoadKm,
  } = args;
  const errors: string[] = [];

  // Anchor candidates by DISTANCE MATRIX road km to the office (not minutes):
  // this only decides WHO OPENS each route — the farthest home takes the first
  // seat. The visiting order below is NOT this list, it is grown hop-by-hop
  // (farthest first, then each stop NEAREST to the previous one, walking back
  // toward the office), so the drawn direction follows the road corridor
  // instead of hopping far → near by office km.
  const remaining = [...members].sort(
    (a, b) => b.toOfficeKm - a.toOfficeKm || b.toOfficeMin - a.toOfficeMin
  );
  const routes: PlannedCorridorRoute[] = [];
  const plannedVehicleIds = new Set<string>();

  // Shared-ride rule: at most DYNAMIC_GROUP_CAPACITY riders, never more seats
  // than the vehicle physically has.
  const capacityFor = (vehicle: VehiclePoolShape) =>
    Math.max(
      1,
      Math.min(vehicle.capacity || DYNAMIC_GROUP_CAPACITY, DYNAMIC_GROUP_CAPACITY)
    );

  // Pinned / 10 PM-reuse pool first, then the office's other vehicles — a
  // vehicle runs at most once per shift per day (unique
  // (dayDate, vehicleId, arrivalTime) constraint).
  const nextVehicle = (): VehiclePoolShape | null => {
    const inPool = pool.find((v) => !plannedVehicleIds.has(v.id));
    if (inPool) return inPool;
    return (
      allVehicles.find(
        (v) =>
          !plannedVehicleIds.has(v.id) &&
          normalizeOfficeLocation(v.officeLocation) === officeKey
      ) ?? null
    );
  };

  /**
   * Nearest leg of the CREATED path for a home — searched over positions
   * 1..seq.length only, i.e. never before the far-first anchor, so a corridor
   * attach can never change who is picked up first. Position `pos` inserts
   * between seq[pos-1] and seq[pos]; pos === seq.length is the final leg to
   * the office. Returns the nearest leg's insertion position, its ROAD
   * distance (home → leg's driving geometry), and the detour minutes the
   * insertion would add.
   */
  const nearestLegInsertion = async (seq: ClusterMember[], m: ClusterMember) => {
    let bestPos = -1;
    let bestLegKm = Infinity;
    let bestAdded = Infinity;
    for (let pos = 1; pos <= seq.length; pos++) {
      const from = seq[pos - 1];
      const to = pos === seq.length ? null : seq[pos];
      const legKm = await legRoadKm(m, from, to);
      const prevIdx = from.matrixIndex;
      const nextIdx = to ? to.matrixIndex : 0;
      const added =
        dMin(prevIdx, m.matrixIndex) +
        dMin(m.matrixIndex, nextIdx) -
        dMin(prevIdx, nextIdx);
      if (
        legKm < bestLegKm - 1e-6 ||
        (Math.abs(legKm - bestLegKm) <= 1e-6 && added < bestAdded)
      ) {
        bestPos = pos;
        bestLegKm = legKm;
        bestAdded = added;
      }
    }
    return { pos: bestPos, legKm: bestLegKm, added: bestAdded };
  };

  while (remaining.length > 0) {
    // Corridor sweep: attach remaining homes to paths already planned until
    // no candidate fits (capacity, corridor distance, and detour bounds).
    // Candidates are COMPARED and the least-detour one wins (tie-break:
    // nearest road distance) — that is the route judging step: among all
    // (route, home, position) options, apply only the attachment that costs
    // the onboard riders the least extra drive.
    let progress = true;
    while (progress) {
      progress = false;
      let bestRoute: PlannedCorridorRoute | null = null;
      let bestMember: ClusterMember | null = null;
      let bestPos = -1;
      let bestAdded = Infinity;
      let bestLegKm = Infinity;

      for (const route of routes) {
        if (route.order.length >= route.capacity) continue;
        for (const m of remaining) {
          const ins = await nearestLegInsertion(route.order, m);
          if (ins.pos < 1) continue;
          if (ins.legKm > CORRIDOR_ATTACH_KM) continue;
          if (ins.added > CORRIDOR_MAX_DETOUR_MIN) continue;
          if (
            ins.added < bestAdded - 1e-6 ||
            (Math.abs(ins.added - bestAdded) <= 1e-6 && ins.legKm < bestLegKm)
          ) {
            bestRoute = route;
            bestMember = m;
            bestPos = ins.pos;
            bestAdded = ins.added;
            bestLegKm = ins.legKm;
          }
        }
      }

      if (bestRoute && bestMember && bestPos >= 0) {
        bestRoute.order.splice(bestPos, 0, bestMember);
        remaining.splice(remaining.indexOf(bestMember), 1);
        progress = true;
      }
    }

    if (remaining.length === 0) break;

    const vehicle = nextVehicle();
    if (!vehicle) {
      errors.push(
        `${arrivalLabel}: ${remaining.length} employee(s) cannot be routed — no spare vehicle with remaining capacity for the ${officeKey} office`
      );
      break;
    }
    plannedVehicleIds.add(vehicle.id);

    // Anchor: the member FARTHEST from the office (distance-matrix road km)
    // is picked up first; the path then walks back toward the office one
    // nearest hop at a time.
    const anchor = remaining.shift()!;
    const anchorToOfficeKm = anchor.toOfficeKm;
    const order: ClusterMember[] = [anchor];
    const capacity = capacityFor(vehicle);

    while (order.length < capacity && remaining.length > 0) {
      const end = order[order.length - 1];
      let best: ClusterMember | null = null;
      let bestIdx = -1;
      let bestRoadMin = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const m = remaining[i];
        // Office-directed chain, in ROAD km (the ordering metric — road
        // MINUTES can invert for near homes): a hop may not move farther from
        // the office than the current end stop, nor farther than the anchor.
        // Both keep the "farthest first, then nearest, walking back toward
        // the office" rule exact at every step.
        if (
          m.toOfficeKm >
          end.toOfficeKm + GROUPING_OFFICE_DIRECTION_SLACK_KM
        ) {
          continue;
        }
        if (
          m.toOfficeKm >
          anchorToOfficeKm + GROUPING_OFFICE_DIRECTION_SLACK_KM
        ) {
          continue;
        }
        // Zigzag guard: compare candidates by ROAD time from the current path
        // end (not the straight-line distance) and skip barrier hops — a
        // home whose road route is much longer than the straight line sits
        // across a highway / rail line / one-way loop that would force the
        // vehicle to zigzag or double back. Such homes wait for a vehicle
        // whose path actually passes them.
        const straightKm = haversineDistance(
          end.home.latitude,
          end.home.longitude,
          m.home.latitude,
          m.home.longitude
        );
        const roadKm = dKm(end.matrixIndex, m.matrixIndex);
        if (straightKm > 0.05 && roadKm > straightKm * MAX_ROAD_VS_STRAIGHT) {
          continue;
        }
        const roadMin = dMin(end.matrixIndex, m.matrixIndex);
        if (roadMin < bestRoadMin) {
          bestRoadMin = roadMin;
          best = m;
          bestIdx = i;
        }
      }

      if (!best) break;
      // Keep the hop within the grouping radius as a hard ceiling on the
      // straight-line gap between consecutive pickups.
      const bestStraightKm = haversineDistance(
        end.home.latitude,
        end.home.longitude,
        best.home.latitude,
        best.home.longitude
      );
      if (bestStraightKm > GROUPING_RADIUS_KM) break;

      // Detour guard for the growth hop: taking this employee must not
      // lengthen the end → office drive by more than GROWTH_MAX_DETOUR_KM of
      // road. A home that genuinely sits on the route's own way detours far
      // less than that and always passes; a side-street / dead-end home (or a
      // barrier reroute) stretches the drawn route instead — skip it here. It
      // is still offered to the corridor-attach pass (judged on the REAL
      // driving geometry, with its own 7-minute cap) and to later vehicles.
      const growDetourKm =
        dKm(end.matrixIndex, best.matrixIndex) +
        best.toOfficeKm -
        end.toOfficeKm;
      if (growDetourKm > GROWTH_MAX_DETOUR_KM) break;

      order.push(best);
      remaining.splice(bestIdx, 1);
    }

    routes.push({ order, vehicle, capacity });
  }

  return { routes, errors };
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

    // When 10 PM pins exist, only those vehicles may receive preset routes.
    // This keeps a vehicle pinned for both 10 PM and 11 PM eligible in both
    // route-planning passes.
    const pinnedIds10PM = await pinnedVehicleIdsForShift(weekStartDate, "10PM");

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
        ? await prisma.pickupPoint.findFirst({
            where: {
              addressId: employee.pickupAddressId,
              isActive: true,
            },
            include: { vehicle: true },
          })
        : null;

      // NAME fallback: the Pick-up Points page and Route Setting can land on
      // SIBLING Address rows for the same stop (case-variant rows, or a raw
      // coordinate-string row created by the old geocoder), so a strict
      // addressId join misses even when names match — which surfaced as the
      // "has no matching 10 PM pickup point" error for employees whose point
      // IS on the vehicle's pickup sequence. Fall back to a case-insensitive
      // name match so the employee still attaches to the owning vehicle.
      if (!pickupPoint && employee.pickupPoint?.trim()) {
        pickupPoint = await prisma.pickupPoint.findFirst({
          where: {
            isActive: true,
            name: {
              equals: employee.pickupPoint.trim(),
              mode: "insensitive",
            },
          },
          include: { vehicle: true },
        });
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
        const pickupPoints = await prisma.pickupPoint.findMany({
          where: { vehicleId, isActive: true },
          include: { address: true },
          orderBy: { sequence: "asc" },
        });

        // ===== SCHEDULED PICKUP TIMES (canonical, per pickup point) =====
        // `PickupPoint.baseETA` is the source of truth for a point's time, so a
        // point keeps ONE pickup time on EVERY day of EVERY week — Sankar at
        // 20:55 is 20:55 on Monday AND Friday. Re-deriving the schedule per day
        // from the learned legs (the old behaviour) was what made the same point
        // drift 21:10 → 21:05 → 21:00 across a week, because each day's run saw
        // a slightly different learned set. If the stored schedule is missing or
        // stale it is recomputed + persisted ONCE here, then never drifts again.
        const vehicleRow = await prisma.vehicle.findUnique({
          where: { id: vehicleId },
          select: { vehicleNumber: true },
        });
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

        const departureTime10 = new Date(dayDate);
        departureTime10.setHours(20, 0, 0, 0);

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
          await prisma.routePlan
            .delete({ where: { id: existing10PM.id } })
            .catch(() => undefined);
        }

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
 *  fetch `ErrorEvent` objects that aren't `Error` instances). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message) return error.message;
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const c = cause as { message?: unknown; reason?: unknown; detail?: unknown };
      if (typeof c.message === "string" && c.message) return c.message;
      if (typeof c.reason === "string" && c.reason) return c.reason;
      if (typeof c.detail === "string" && c.detail) return c.detail;
    }
    return String(error);
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.length > 0
  ) {
    return (error as { message: string }).message;
  }
  if (
    error &&
    typeof error === "object" &&
    "reason" in error &&
    typeof (error as { reason?: unknown }).reason === "string"
  ) {
    return String((error as { reason: unknown }).reason);
  }
  // ErrorEvent (undici/fetch): url + type + message carry the failure.
  if (error && typeof error === "object") {
    const o = error as {
      type?: unknown;
      target?: { url?: unknown };
      message?: unknown;
      detail?: unknown;
    };
    const bits: string[] = [];
    if (typeof o.type === "string") bits.push(`type=${o.type}`);
    const url = (o.target as { url?: unknown } | undefined)?.url;
    if (typeof url === "string") bits.push(`url=${url}`);
    if (typeof o.message === "string" && o.message) bits.push(o.message);
    if (typeof o.detail === "string" && o.detail) bits.push(o.detail);
    if (bits.length > 0) return `OSRM/network error (${bits.join(", ")})`;

    // Last resort for opaque event/exception objects: dump the own enumerable
    // fields so the user sees SOMETHING actionable instead of "[object X]".
    try {
      const fields: string[] = [];
      for (const key of Object.keys(o)) {
        const value = (o as unknown as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) fields.push(`${key}=${value}`);
        else if (typeof value === "number") fields.push(`${key}=${value}`);
      }
      if (fields.length > 0) return `Network error (${fields.join(", ")})`;
    } catch {
      // ignore introspection failures
    }
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

  // Vehicles that own active pickup points are 10 PM PRESET vehicles. Under
  // STRICT shift separation a dynamic (home-address) shift must never borrow
  // them: a 10 PM vehicle with a fixed pickup sequence silently swallowing
  // 11 PM / late-night riders is exactly the "forcefully reassigned, main
  // route changed" symptom. A preset-owning vehicle may only serve a dynamic
  // shift when it is EXPLICITLY pinned for that shift in Route Setting.
  const presetOwnerRows = await prisma.pickupPoint.findMany({
    where: { isActive: true },
    distinct: ["vehicleId"],
    select: { vehicleId: true },
  });
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

  const dayDate = new Date(weekStartDate);
  dayDate.setDate(dayDate.getDate() + dayOfWeek);
  const arrivalMinutes = arrivalMinutesFromLabel(arrivalLabel);

  for (const [officeKey, officeSchedules] of employeesByOffice) {
    const office = officeCoordinatesFor(officeKey);

    // Vehicle pool for this office: pinned (exclusive) → dedicated (non-10 PM)
    // office vehicles (see corridorEligibleVehicles — preset owners excluded
    // unless pinned for this shift).
    let pool = poolForOffice(officeKey, corridorEligibleVehicles, pinnedIds);
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

    // ===== Path-based corridor planner (see planCorridorRoutes) =====
    // Far-first paths + corridor attach + sequential vehicle consolidation,
    // so overlapping paths share one vehicle instead of running in parallel.
    // The corridor test uses each leg's ACTUAL DRIVING geometry (OSRM road
    // polyline): a home only "follows the created path" when the vehicle can
    // pass it without leaving the road. Straight lines cross lakes, gated
    // blocks and side lanes that would force a detour and change the route.
    const legRoadKm = async (
      m: ClusterMember,
      from: ClusterMember,
      to: ClusterMember | null
    ): Promise<number> => {
      const a: Location = {
        lat: from.home.latitude,
        lng: from.home.longitude,
      };
      const b: Location = to
        ? { lat: to.home.latitude, lng: to.home.longitude }
        : { lat: office.lat, lng: office.lng };
      const p = { lat: m.home.latitude, lng: m.home.longitude };
      try {
        const line = await getRoutePolyline(a, b, {
          // Enforce the vehicle's outgoing heading on this leg: at `a` it must
          // head toward `b` (the destination / office), so OSRM doesn't
          // map-match to the opposite carriageway of a divided road and force
          // a U-turn/loop (distorts the corridor test).
          initialBearingDeg: bearingDegrees(a, b),
        });
        if (line.length >= 2) {
          return distancePointToPolylineKm(p, line);
        }
      } catch {
        // OSRM hiccup — fall back to the straight-line corridor test so a
        // routing outage degrades precision, never availability.
      }
      return distancePointToSegmentKm(p, a, b);
    };

    // Warm the persisted polyline cache with every leg this pass can test —
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
    // Failed legs are fetched lazily later (each with its own fallback), so
    // the warm is purely a latency optimization.
    try {
      await warmPolylineCache(warmKeys);
    } catch {
      // silent — precision/availability degrade per-leg, never globally
    }

    const planned = await planCorridorRoutes({
      members,
      pool,
      allVehicles: corridorEligibleVehicles,
      officeKey,
      office,
      arrivalLabel,
      dMin,
      dKm,
      legRoadKm,
    });
    errors.push(...planned.errors);

    for (let planIdx = 0; planIdx < planned.routes.length; planIdx++) {
      // Created inside the try so a mid-way failure can roll it back; a
      // half-populated DRAFT route would otherwise look valid but silently
      // miss employees.
      let createdRoutePlanId: string | null = null;

      try {
        const { order: plannedOrder, vehicle } = planned.routes[planIdx];
        let order = plannedOrder;

        // Replay the learned route pattern (tuned sequence AND the finalized
        // pickup times captured at the previous finalize of this vehicle +
        // arrival time): pattern riders ride first in the learned order with
        // their FINALIZED pickup times replayed verbatim; new riders (not in
        // the pattern) ride after in their planned order.
        const template = await prisma.routeTemplate.findUnique({
          where: {
            vehicleId_arrivalTime: {
              vehicleId: vehicle.id,
              arrivalTime: arrivalLabel,
            },
          },
          select: {
            stops: {
              orderBy: { seq: "asc" },
              select: { employeeId: true, pickupTime: true },
            },
          },
        });
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
        const existingPlan = await prisma.routePlan.findUnique({
          where: {
            dayDate_vehicleId_arrivalTime: {
              dayDate,
              vehicleId: vehicle.id,
              arrivalTime: arrivalLabel,
            },
          },
          select: { id: true, status: true },
        });
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
          await prisma.routePlan
            .delete({ where: { id: existingPlan.id } })
            .catch(() => undefined);
        }

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

        if (order.length > 0) {
          // One batched insert instead of a per-rider round-trip — same rows,
          // same sequence numbering, one database call.
          await prisma.tripAssignment.createMany({
            data: order.map((m, i) => ({
              routePlanId: routePlan.id,
              weeklyScheduleDayId: m.schedule.id,
              employeeId: m.employee.id,
              vehicleId: vehicle.id,
              pickupType: "HOME_ADDRESS",
              pickupAddressId: m.home.id,
              pickupTime: pickupTimes[i],
              sequenceInTrip: i + 1,
              assignedAt: new Date(),
            })),
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