/**
 * Pure (no Prisma / no fetch) building blocks of the route analysis:
 *
 *  - side candidates: for every stop, two ways to snap the SAME lat/lng — the
 *    road heading `h` and its opposite `h+180` — so OSRM places the vehicle
 *    on the carriageway that already faces the next stop (the Zigatola →
 *    Dhanmondi 15 case) instead of the nearest side with a loop-around;
 *  - `chooseSides`: Viterbi / DP over a fixed stop order picking one candidate
 *    per waypoint that minimizes total drive time from an all-to-all table;
 *  - `searchOrder`: exact permutation search (≤ 7 stops) or Or-opt local
 *    search over the stop order, each order priced with `chooseSides`, with
 *    the office fixed as the end (chain) or as start + end (loop);
 *  - `scoreRoute`: judge a routed candidate — minutes, km, U-turns, loop-
 *    arounds at stops, backtracked km over repeated OSM segments, detour
 *    ratio — and a single composite score to rank candidates.
 *
 * Kept dependency-free so it is unit-testable with `node:test` and could be
 * shared with the client bundle.
 */

import type { OsrmDetailedRoute } from "./osrm";
import {
  haversineDistance,
  headingDifference,
  normalizeHeading,
  type BearingConstraint,
} from "./utils";

/** Allowed deviation (°) around a side candidate's heading. */
export const SIDE_BEARING_RANGE = 60;
/** Snap radius (m) for a side candidate so the "other side" never jumps to a parallel street. */
export const SIDE_SNAP_RADIUS_M = 70;
/** Exhaustive permutation search up to this many free stops (7! = 5040 orders). */
export const MAX_EXHAUSTIVE_STOPS = 7;

/** Composite-score weights (minutes-equivalent). */
export const SCORE_WEIGHTS = {
  perUturn: 3,
  perLoopAround: 2,
  perBacktrackKm: 5,
} as const;

/** One way to snap a waypoint: a heading filter (or none). */
export interface SideCandidate {
  waypoint: number;
  /** Heading the vehicle faces at the stop; null = unconstrained snap. */
  headingDeg: number | null;
}

/**
 * Two heading candidates per constrained waypoint (road axis `h` and the
 * opposite carriageway `h+180`), one unconstrained candidate otherwise. The
 * returned array order is the coordinate order to send to OSRM.
 */
export function buildSideCandidates(
  waypointCount: number,
  roadAxisDeg: ReadonlyArray<number | null>,
  constrain: ReadonlyArray<boolean>
): SideCandidate[] {
  const out: SideCandidate[] = [];
  for (let w = 0; w < waypointCount; w++) {
    const axis = roadAxisDeg[w];
    if (constrain[w] && axis != null && Number.isFinite(axis)) {
      out.push({ waypoint: w, headingDeg: normalizeHeading(axis) });
      out.push({ waypoint: w, headingDeg: normalizeHeading(axis + 180) });
    } else {
      out.push({ waypoint: w, headingDeg: null });
    }
  }
  return out;
}

/** Group candidate indices by waypoint: `byWaypoint[w] = [candidateIdx…]`. */
export function candidatesByWaypoint(
  candidates: ReadonlyArray<SideCandidate>,
  waypointCount: number
): number[][] {
  const by: number[][] = Array.from({ length: waypointCount }, () => []);
  candidates.forEach((c, idx) => by[c.waypoint].push(idx));
  return by;
}

/** OSRM constraint arrays for a candidate list (same order). */
export function candidateConstraints(
  candidates: ReadonlyArray<SideCandidate>
): {
  bearings: Array<BearingConstraint | null>;
  radiuses: Array<number | null>;
} {
  return {
    bearings: candidates.map((c) =>
      c.headingDeg == null ? null : { deg: c.headingDeg, range: SIDE_BEARING_RANGE }
    ),
    radiuses: candidates.map((c) => (c.headingDeg == null ? null : SIDE_SNAP_RADIUS_M)),
  };
}

export interface SideChoice {
  /** Total cost (seconds) of the best side assignment; Infinity if unroutable. */
  cost: number;
  /** Chosen candidate index per position of `order`. */
  chosen: number[];
}

/**
 * Viterbi over the waypoint sequence: state = candidate of the current
 * waypoint, transition cost = table duration from the previous waypoint's
 * candidate. Exact and O(n · k²) with k ≤ 2 candidates per stop.
 */
export function chooseSides(
  order: ReadonlyArray<number>,
  byWaypoint: ReadonlyArray<ReadonlyArray<number>>,
  durations: ReadonlyArray<ReadonlyArray<number | null>>
): SideChoice {
  if (order.length === 0) return { cost: 0, chosen: [] };
  const n = order.length;
  let prevCost: number[] = byWaypoint[order[0]].map(() => 0);
  const back: number[][] = [];

  for (let i = 1; i < n; i++) {
    const prevCands = byWaypoint[order[i - 1]];
    const curCands = byWaypoint[order[i]];
    const cost: number[] = new Array(curCands.length).fill(Infinity);
    const from: number[] = new Array(curCands.length).fill(-1);
    for (let b = 0; b < curCands.length; b++) {
      for (let a = 0; a < prevCands.length; a++) {
        const d = durations[prevCands[a]]?.[curCands[b]];
        if (d == null || !Number.isFinite(prevCost[a])) continue;
        const total = prevCost[a] + d;
        if (total < cost[b]) {
          cost[b] = total;
          from[b] = a;
        }
      }
    }
    back.push(from);
    prevCost = cost;
  }

  let bestEnd = 0;
  for (let b = 1; b < prevCost.length; b++) {
    if (prevCost[b] < prevCost[bestEnd]) bestEnd = b;
  }
  const chosenPos: number[] = new Array(n);
  let cur = bestEnd;
  for (let i = n - 1; i >= 0; i--) {
    chosenPos[i] = cur;
    if (i > 0) cur = back[i - 1][cur];
  }
  if (chosenPos.some((c) => c < 0)) {
    return { cost: Infinity, chosen: order.map((w) => byWaypoint[w][0]) };
  }
  return {
    cost: prevCost[bestEnd],
    chosen: chosenPos.map((c, i) => byWaypoint[order[i]][c]),
  };
}

export interface OrderSearchInput {
  /** Waypoint indices of the free (permutable) stops, in the current order. */
  stops: ReadonlyArray<number>;
  /** Fixed first waypoint (late-night loop: the office) or null (chain). */
  start: number | null;
  /** Fixed last waypoint (always the office). */
  end: number;
  byWaypoint: ReadonlyArray<ReadonlyArray<number>>;
  durations: ReadonlyArray<ReadonlyArray<number | null>>;
  maxExhaustive?: number;
}

export interface OrderSearchResult {
  /** Full waypoint sequence incl. fixed start/end. */
  order: number[];
  sides: SideChoice;
}

function fullOrder(stops: ReadonlyArray<number>, start: number | null, end: number): number[] {
  return start == null ? [...stops, end] : [start, ...stops, end];
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i], ...p];
  }
}

/**
 * Best stop order (jointly with side choice). Exhaustive for small routes,
 * Or-opt (move a segment of 1–3 stops elsewhere) hill-climbing otherwise.
 * Ties keep the input order so a no-gain search never "changes" a route.
 */
export function searchOrder(input: OrderSearchInput): OrderSearchResult {
  const { stops, start, end, byWaypoint, durations } = input;
  const price = (seq: ReadonlyArray<number>) =>
    chooseSides(fullOrder(seq, start, end), byWaypoint, durations);

  let bestStops = [...stops];
  let best = price(bestStops);

  const maxEx = input.maxExhaustive ?? MAX_EXHAUSTIVE_STOPS;
  if (stops.length <= maxEx) {
    for (const perm of permutations([...stops])) {
      const s = price(perm);
      if (s.cost < best.cost - 1e-6) {
        best = s;
        bestStops = perm;
      }
    }
    return { order: fullOrder(bestStops, start, end), sides: best };
  }

  // Or-opt local search.
  let improved = true;
  while (improved) {
    improved = false;
    const n = bestStops.length;
    for (let len = 1; len <= 3 && !improved; len++) {
      for (let i = 0; i + len <= n && !improved; i++) {
        const segment = bestStops.slice(i, i + len);
        const remainder = [...bestStops.slice(0, i), ...bestStops.slice(i + len)];
        for (let j = 0; j <= remainder.length && !improved; j++) {
          if (j === i) continue;
          for (const seg of [segment, [...segment].reverse()]) {
            const candidate = [...remainder.slice(0, j), ...seg, ...remainder.slice(j)];
            const s = price(candidate);
            if (s.cost < best.cost - 1e-6) {
              best = s;
              bestStops = candidate;
              improved = true;
              break;
            }
          }
        }
      }
    }
  }
  return { order: fullOrder(bestStops, start, end), sides: best };
}

/* ── Scoring ─────────────────────────────────────────────────────────── */

export interface RouteMetrics {
  durationMin: number;
  distanceKm: number;
  /** Explicit U-turn manoeuvres anywhere on the route. */
  uturns: number;
  /** Stops where the vehicle leaves facing ≥135° away from how it arrived. */
  loopArounds: number;
  /** Kilometres driven over road segments the route already used. */
  backtrackKm: number;
  /** Routed km ÷ straight-line km between consecutive waypoints (≥ 1). */
  detourRatio: number;
  /** Consecutive stops where the office distance INCREASES (far→near breaks). */
  farNearViolations: number;
}

/** Per-waypoint arrival / departure headings read from the turn steps. */
export interface WaypointHeadings {
  /** Heading when departing the waypoint (null for the final one). */
  departDeg: number | null;
  /** Heading when arriving at the waypoint (null for the first one). */
  arriveDeg: number | null;
}

export function waypointHeadings(route: OsrmDetailedRoute): WaypointHeadings[] {
  const m = route.legs.length + 1;
  const out: WaypointHeadings[] = Array.from({ length: m }, () => ({
    departDeg: null,
    arriveDeg: null,
  }));
  route.legs.forEach((leg, k) => {
    const first = leg.steps?.[0];
    const last = leg.steps?.[leg.steps.length - 1];
    if (first) out[k].departDeg = normalizeHeading(first.maneuver.bearing_after);
    // The `arrive` step has bearing_after 0; the heading into the stop is the
    // previous step's bearing_after (or the arrive step's bearing_before).
    if (last) out[k + 1].arriveDeg = normalizeHeading(last.maneuver.bearing_before);
  });
  return out;
}

/**
 * Km of the route that re-uses road segments already driven (either
 * direction). Uses the per-vertex OSM node annotation: an edge is the pair of
 * consecutive node ids; `annotation.distance[i]` is the metres of edge i.
 */
export function backtrackKm(route: OsrmDetailedRoute): number {
  const seen = new Set<string>();
  let repeated = 0;
  for (const leg of route.legs) {
    const nodes = leg.annotation?.nodes;
    const dist = leg.annotation?.distance;
    if (!nodes || !dist) continue;
    for (let i = 0; i + 1 < nodes.length && i < dist.length; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) repeated += dist[i];
      else seen.add(key);
    }
  }
  return repeated / 1000;
}

export function countUturns(route: OsrmDetailedRoute): number {
  let n = 0;
  for (const leg of route.legs) {
    for (const s of leg.steps ?? []) {
      const t = s.maneuver.type;
      if (t === "depart" || t === "arrive") continue;
      if (s.maneuver.modifier === "uturn") n++;
    }
  }
  return n;
}

export function countLoopArounds(route: OsrmDetailedRoute): number {
  const h = waypointHeadings(route);
  let n = 0;
  for (let k = 1; k < h.length - 1; k++) {
    const a = h[k].arriveDeg;
    const d = h[k].departDeg;
    if (a == null || d == null) continue;
    if (headingDifference(a, d) >= 135) n++;
  }
  return n;
}

export function straightChainKm(
  points: ReadonlyArray<{ lat: number; lng: number }>
): number {
  let km = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    km += haversineDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return km;
}

/** Count consecutive stops whose office distance grows (0 = strictly far→near). */
export function farNearViolations(
  stopOrder: ReadonlyArray<number>,
  toOfficeKm: ReadonlyArray<number | null>,
  toleranceKm = 0.05
): number {
  let n = 0;
  for (let i = 0; i + 1 < stopOrder.length; i++) {
    const a = toOfficeKm[stopOrder[i]];
    const b = toOfficeKm[stopOrder[i + 1]];
    if (a == null || b == null) continue;
    if (b > a + toleranceKm) n++;
  }
  return n;
}

export function scoreRoute(
  route: OsrmDetailedRoute,
  waypointPoints: ReadonlyArray<{ lat: number; lng: number }>,
  farNear: number
): { metrics: RouteMetrics; score: number } {
  const durationMin = route.duration / 60;
  const distanceKm = route.distance / 1000;
  const straight = straightChainKm(waypointPoints);
  const metrics: RouteMetrics = {
    durationMin: round1(durationMin),
    distanceKm: round2(distanceKm),
    uturns: countUturns(route),
    loopArounds: countLoopArounds(route),
    backtrackKm: round2(backtrackKm(route)),
    detourRatio: straight > 0 ? round2(distanceKm / straight) : 1,
    farNearViolations: farNear,
  };
  const score =
    durationMin +
    SCORE_WEIGHTS.perUturn * metrics.uturns +
    SCORE_WEIGHTS.perLoopAround * metrics.loopArounds +
    SCORE_WEIGHTS.perBacktrackKm * metrics.backtrackKm;
  return { metrics, score: round1(score) };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
