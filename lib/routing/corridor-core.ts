/**
 * PURE corridor-routing core — the decision-making half of route generation.
 *
 * Everything in this module is deterministic and side-effect free:
 *
 *  - **No I/O. Ever.** No `prisma`, no `fetch`, no `await`, no timers, no
 *    `process.env`, no wall-clock reads. Data goes in as arguments, decisions
 *    come out as return values.
 *  - **No async.** Every export is a plain synchronous function. Inputs the
 *    caller had to fetch (database rows, OSRM matrices, road polylines) arrive
 *    as plain objects/lookups, so callers can precompute them however they
 *    like — cache, batch, or test with literals.
 *  - **No ambient state.** No module-level mutable caches. Two calls with
 *    equal arguments always produce equal results, which is what makes the
 *    planner unit-testable with hand-built `ClusterMember` literals.
 *
 * The orchestration half — Prisma queries, OSRM fetches, geocoding, and the
 * writes that persist a plan — lives in `algorithms.ts`, which imports from
 * here. The dependency is one-directional: this file must never import from
 * `algorithms.ts`, or from anything that reaches the network/database.
 *
 * ### What the planner decides
 *
 * 1. **Nearest-hop paths.** Each route is anchored at the member FARTHEST from
 *    the office by distance-matrix road km — the farthest home is always picked
 *    up first. The path then walks back toward the office one hop at a time:
 *    each stop is the remaining member NEAREST (by road minutes) to the current
 *    end, within `GROUPING_RADIUS_KM`, office-directed within
 *    `GROUPING_OFFICE_DIRECTION_SLACK_KM` of BOTH the anchor and the current
 *    end, and bounded by the zigzag guard (`MAX_ROAD_VS_STRAIGHT`). A candidate
 *    whose pickup would extend the end → office drive by more than
 *    `GROWTH_MAX_DETOUR_KM` of road is SKIPPED instead of lengthening the drawn
 *    route — it waits for the corridor attach or a later vehicle. The visiting
 *    order IS the grown chain and is never re-sorted, so the drawn direction
 *    follows the road corridor.
 * 2. **Corridor attach.** After each path exists, the remaining employees are
 *    swept: anyone whose home lies within `CORRIDOR_ATTACH_KM` of one of the
 *    route's driving-geometry legs — and whose insertion there adds at most
 *    `CORRIDOR_MAX_DETOUR_MIN` minutes — is attached AT THAT LEG. Existing
 *    stops keep their exact order (the created route is never restructured) and
 *    the far-first anchor can never be displaced: attachments start at the leg
 *    AFTER the anchor. Anything that does not fit cleanly is left unassigned
 *    rather than changing the created route.
 * 3. **Vehicle consolidation.** Vehicles fill to capacity SEQUENTIALLY: a
 *    second vehicle opens only when no planned route can take another
 *    passenger, so overlapping paths share one vehicle instead of running in
 *    parallel.
 */

import { dhakaDateTimeFromMinutes } from "@/lib/date/week";
import { haversineDistance } from "./utils";

/** Dynamic (11 PM / late-night) shared-ride rules.
 * Max riders per vehicle — a 10-seater fills to 6, a 4-seater stays at its
 * seats (never more riders than physical capacity). */
export const DYNAMIC_GROUP_CAPACITY = 6;

/** Homes within this straight-line radius of the growing group share a
 * vehicle — nearby addresses ride together. Anyone farther is left for a
 * later vehicle. */
export const GROUPING_RADIUS_KM = 2.0;

/** A member may sit up to this far (km) beyond the group's anchor in road
 * distance-from-office and still join — the nearest-hop ordering then walks
 * the route back toward the office, never farther than the anchor (nor more
 * than this beyond the current end stop). */
export const GROUPING_OFFICE_DIRECTION_SLACK_KM = 1.0;

/** After a route's path exists, a remaining employee whose home sits within
 * this distance of one of the route's legs' ACTUAL DRIVING geometry (OSRM
 * road polyline) rides that route — instead of getting another vehicle —
 * when the insertion adds at most CORRIDOR_MAX_DETOUR_MIN minutes of detour
 * for the onboard riders. Homes off the road path are skipped: attaching
 * them would change the first-created route. */
export const CORRIDOR_ATTACH_KM = 0.8;

/** Hard cap on the road-time detour an attachment may add for the onboard
 * riders, measured with the real OSRM matrix. Calibrated against Facilities'
 * review of the Sep 7 plan: a genuinely on-the-way pickup (Khilkhet into the
 * Dakkhinkhan→Gulshan run) adds ~6.5 min, while a home that forces the vehicle
 * off the created path (Kalachandpur side trip) adds ~7.5 min and must be
 * skipped — it rides another vehicle instead. */
export const CORRIDOR_MAX_DETOUR_MIN = 7;

/** When growing a path, the next pickup may not add more than this much ROAD
 * distance over driving straight to the office (end → home → office vs end →
 * office). A home that truly sits on the created path's way detours far less
 * than this and always passes; a house on a dead-end street / side trip (or a
 * barrier reroute) stretches the drawn route instead, so it is skipped here
 * and left for the corridor-attach pass (judged against the real driving
 * geometry) or a later vehicle. */
export const GROWTH_MAX_DETOUR_KM = 2;

/** Zigzag guard for path growth: a hop whose ROAD distance exceeds this
 * factor of the straight-line distance crosses a barrier (highway, rail
 * line, lake, one-way loop) — grouping such homes would force the vehicle to
 * detour far around and double back. They wait for a vehicle whose path
 * actually passes them. */
export const MAX_ROAD_VS_STRAIGHT = 2.5;

// ---------------------------------------------------------------------------
// Shapes the planner reads. Kept structural (not Prisma types) so the solver
// can be exercised with plain object literals in tests.
// ---------------------------------------------------------------------------

export type HomeAddressShape = {
  id: string;
  addressText: string;
  latitude: number;
  longitude: number;
};

export type EmployeeShape = {
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

export type ScheduleAgg = {
  id: string;
  dayOfWeek: number;
  arrivalTime: string | null;
  weeklySchedule: { weekStartDate: Date; employee: EmployeeShape };
};

export type ClusterMember = {
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

export type VehiclePoolShape = {
  id: string;
  officeLocation: string;
  capacity: number;
};

export type PlannedCorridorRoute = {
  /** Travel sequence: pickups in visiting order (the vehicle's office is the
   * implicit final destination and is not part of this list). */
  order: ClusterMember[];
  vehicle: VehiclePoolShape;
  capacity: number;
};

/**
 * Precomputed road distance (km) from a candidate home to a leg's ACTUAL
 * DRIVING GEOMETRY — the corridor test that decides whether a home truly
 * "follows the created path".
 *
 * A plain data map, so the planner stays synchronous: the orchestrator fills it
 * from the (cached) OSRM polylines before planning, and the solver just reads.
 * Keyed by `homeIndex|fromIndex|toIndex` (matrix indices; office = index 0),
 * built with `legRoadKey()`.
 */
export type LegRoadIndex = ReadonlyMap<string, number>;

/** Build the `LegRoadIndex` key for one (home, leg-from, leg-to) triple. */
export function legRoadKey(
  homeMatrixIndex: number,
  fromMatrixIndex: number,
  toMatrixIndex: number
): string {
  return `${homeMatrixIndex}|${fromMatrixIndex}|${toMatrixIndex}`;
}

/**
 * An empty index — every corridor test falls back to the straight-line
 * distance. Used when the caller has no road geometry available (e.g. an OSRM
 * outage), which degrades precision, never availability.
 */
export const EMPTY_LEG_ROAD_INDEX: LegRoadIndex = new Map<string, number>();

// ---------------------------------------------------------------------------
// Matrix readers. The matrix arrives as a plain OSRM-shaped object, so these
// take no dependency on the OSRM client (and no I/O) while staying byte-for-
// byte compatible with the rows the client returns.
// ---------------------------------------------------------------------------

type BareMatrixElement = {
  distance: { value: number; text: string };
  duration: { value: number; text: string };
  status?: string;
};

type BareMatrix = { rows?: Array<{ elements?: BareMatrixElement[] }> };
type BareLocation = { lat: number; lng: number };

/**
 * Read a travel duration (minutes, minimum 1) from an OSRM matrix response,
 * falling back to a great-circle estimate (25 km/h) when a leg is missing.
 */
export function matrixDurationMin<E extends BareMatrixElement>(
  matrix: { rows?: Array<{ elements?: E[] }> },
  locations: BareLocation[],
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

/**
 * Read a road distance (km, minimum 0.001) from an OSRM matrix response,
 * falling back to a great-circle distance when a leg is missing.
 */
export function matrixDistanceKm<E extends BareMatrixElement>(
  matrix: { rows?: Array<{ elements?: E[] }> },
  locations: BareLocation[],
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
  return Math.max(0.001, haversineDistance(from.lat, from.lng, to.lat, to.lng));
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Straight-line distance in km from point `p` to segment `a→b`, using a
 * local equirectangular projection (accurate at Dhaka city scale). */
export function distancePointToSegmentKm(
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

export type { BareMatrix };


/** Look a precomputed leg road distance up, or `null` when absent (the caller
 * then falls back to the straight-line corridor test). */
export function legRoadKmFromIndex(
  index: LegRoadIndex,
  homeMatrixIndex: number,
  fromMatrixIndex: number,
  toMatrixIndex: number
): number | null {
  const hit = index.get(
    legRoadKey(homeMatrixIndex, fromMatrixIndex, toMatrixIndex)
  );
  return typeof hit === "number" && Number.isFinite(hit) ? hit : null;
}

// ---------------------------------------------------------------------------
// Clock / label helpers (pure string + Date arithmetic — no wall-clock reads)
// ---------------------------------------------------------------------------

/**
 * Minutes-from-midnight when a vehicle must arrive at the office for a given
 * arrival label. Late-night labels (12 AM-6 AM) fall on the following calendar
 * day, so they are expressed as 1440 + shift minutes.
 */
export function arrivalMinutesFromLabel(arrivalTime: string): number {
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
export function dateForArrivalMinutes(dayDate: Date, minutes: number): Date {
  return dhakaDateTimeFromMinutes(dayDate, minutes);
}

/** Parse a "HH:mm" clock time into minutes-from-midnight (0 if invalid). */
export function hhmmToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

// ---------------------------------------------------------------------------
// Vehicle pool
// ---------------------------------------------------------------------------

/** Pick a vehicle pool for one office (pinned vehicles take priority). The
 * caller passes the office-comparison predicate so this module stays free of
 * app constants and the comparison can never drift from the app's own. */
export function poolForOffice(
  officeKey: string,
  allVehicles: VehiclePoolShape[],
  pinnedIds: string[],
  isSameOffice: (officeLocation: string, officeKey: string) => boolean
): VehiclePoolShape[] {
  const officeVehicles = allVehicles.filter((v) =>
    isSameOffice(v.officeLocation, officeKey)
  );
  if (pinnedIds.length === 0) return officeVehicles;
  const pinned = officeVehicles.filter((v) => pinnedIds.includes(v.id));
  return pinned.length > 0 ? pinned : officeVehicles;
}



// ---------------------------------------------------------------------------
// Error text
// ---------------------------------------------------------------------------

/** Best-effort human-readable message from any thrown value (including DOM /
 *  fetch `ErrorEvent` objects that aren't `Error` instances). Pure — it only
 *  inspects the value it is given. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message) return error.message;
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const c = cause as {
        message?: unknown;
        reason?: unknown;
        detail?: unknown;
      };
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
        if (typeof value === "string" && value.trim())
          fields.push(`${key}=${value}`);
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
 * Path-based corridor planner for the dynamic shifts (11 PM / 12 AM-6 AM).
 *
 * Pure and synchronous: every distance it needs arrives as data — `dMin` /
 * `dKm` read the caller's precomputed OSRM matrix, and `legRoadKm` reads the
 * caller's precomputed `LegRoadIndex` (road distance from a candidate home to a
 * leg's real driving geometry). Nothing here awaits, queries, or fetches, so
 * the whole planner is deterministic and unit-testable with literals.
 *
 * The three phases (nearest-hop growth → corridor attach → sequential vehicle
 * consolidation) are documented at the top of this module.
 */
export function planCorridorRoutes(args: {
  members: ClusterMember[];
  pool: VehiclePoolShape[];
  allVehicles: VehiclePoolShape[];
  officeKey: string;
  /** Office coordinates — only used for the straight-line corridor fallback on
   * the final leg to the office (when no road geometry is available). Pure
   * data, no I/O. */
  office: { lat: number; lng: number };
  isSameOffice: (officeLocation: string, officeKey: string) => boolean;
  arrivalLabel: string;
  /** Road MINUTES between two matrix indices (minimum 1). */
  dMin: (fromIdx: number, toIdx: number) => number;
  /** Road KM between two matrix indices — the zigzag guard for path growth
   * (a hop is skipped when the road is much longer than the straight line,
   * i.e. the homes sit across a barrier / one-way loop). */
  dKm: (fromIdx: number, toIdx: number) => number;
  /** Road distance (km) from a candidate home to the leg `from → to`'s actual
   * driving geometry (`to === null` means the leg to the office). Returning
   * `null` falls back to the straight-line corridor test — used when no road
   * geometry is available (OSRM outage), which degrades precision only. */
  legRoadKm: (
    m: ClusterMember,
    from: ClusterMember,
    to: ClusterMember | null
  ) => number | null;
}): { routes: PlannedCorridorRoute[]; errors: string[] } {
  const {
    members,
    pool,
    allVehicles,
    officeKey,
    office,
    isSameOffice,
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
      Math.min(
        vehicle.capacity || DYNAMIC_GROUP_CAPACITY,
        DYNAMIC_GROUP_CAPACITY
      )
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
          isSameOffice(v.officeLocation, officeKey)
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
  const nearestLegInsertion = (seq: ClusterMember[], m: ClusterMember) => {
    let bestPos = -1;
    let bestLegKm = Infinity;
    let bestAdded = Infinity;
    for (let pos = 1; pos <= seq.length; pos++) {
      const from = seq[pos - 1];
      const to = pos === seq.length ? null : seq[pos];
      const roadKm = legRoadKm(m, from, to);
      // No road geometry for this leg (OSRM outage / cold cache): fall back to
      // the straight-line corridor test so the attach still works. The final
      // leg runs to the office (not to another home), so its segment endpoint
      // is the office coordinates.
      const legKm =
        roadKm ??
        distancePointToSegmentKm(
          { lat: m.home.latitude, lng: m.home.longitude },
          { lat: from.home.latitude, lng: from.home.longitude },
          to
            ? { lat: to.home.latitude, lng: to.home.longitude }
            : { lat: office.lat, lng: office.lng }
        );
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
          const ins = nearestLegInsertion(route.order, m);
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
        if (m.toOfficeKm > end.toOfficeKm + GROUPING_OFFICE_DIRECTION_SLACK_KM) {
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
        if (straightKm > GROUPING_RADIUS_KM) continue;
        const roadKm = dKm(end.matrixIndex, m.matrixIndex);
        if (straightKm > 0.05 && roadKm > straightKm * MAX_ROAD_VS_STRAIGHT) {
          continue;
        }
        const growDetourKm =
          roadKm + m.toOfficeKm - end.toOfficeKm;
        if (growDetourKm > GROWTH_MAX_DETOUR_KM) continue;
        const roadMin = dMin(end.matrixIndex, m.matrixIndex);
        if (roadMin < bestRoadMin) {
          bestRoadMin = roadMin;
          best = m;
          bestIdx = i;
        }
      }

      if (!best) break;
      order.push(best);
      remaining.splice(bestIdx, 1);
    }

    routes.push({ order, vehicle, capacity });
  }

  return { routes, errors };
}
