/**
 * Route analysis — judges a stored RoutePlan and proposes better ways to
 * drive it, on demand from the route map:
 *
 *  1. `current`        — the route exactly as the map drew it until now
 *                        (stored order, only the first waypoint's heading
 *                        constrained), with turn steps so it can be scored;
 *  2. `current_sided`  — same order, but every stop's SIDE of the road /
 *                        carriageway chosen so the vehicle already faces the
 *                        next stop (one /table over two heading candidates per
 *                        stop, then a DP — see side-selection.ts);
 *  3. `optimized`      — order AND sides optimized jointly (exhaustive for
 *                        ≤ 7 stops); omitted when it equals the stored order.
 *
 * Every candidate is scored (minutes, km, U-turns, loop-arounds, backtracked
 * km, detour ratio, far→near breaks). Facilities compare and apply one.
 *
 * OSRM budget per analysis on the public demo server: 1 route + 1 table
 * (+ NoSegment retries) + up to 2 routes ≈ 4 requests.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  getRouteDetailed,
  getTableWithConstraints,
  OsrmError,
  type Location,
  type OsrmDetailedRoute,
  type OsrmTable,
  type WaypointConstraints,
} from "./osrm";
import { bearingDegrees, type BearingConstraint } from "./utils";
import {
  buildSideCandidates,
  candidatesByWaypoint,
  candidateConstraints,
  chooseSides,
  searchOrder,
  scoreRoute,
  waypointHeadings,
  farNearViolations,
  SIDE_BEARING_RANGE,
  SIDE_SNAP_RADIUS_M,
  type SideCandidate,
} from "./side-selection";
import { isLateNightArrivalLabel } from "@/lib/constants/route-shifts";
import { officeCoordinatesFor } from "@/lib/constants/office-locations";
import type {
  AnalysisWaypoint,
  CandidateId,
  RouteAnalysis,
  RouteCandidate,
} from "./route-analysis.types";

/** Heading tolerance used by the map today for the first waypoint only. */
const LEGACY_FIRST_BEARING_RANGE = 45;
/** How many NoSegment retries before giving up on heading candidates. */
const MAX_TABLE_RETRIES = 4;

export type { RouteAnalysis, RouteCandidate, CandidateId, AnalysisWaypoint };

/** Everything the analysis needs, loaded from one RoutePlan. */
export interface AnalysisInput {
  routePlanId: string;
  routeType: string;
  arrivalTime: string;
  vehicleId: string;
  topology: "chain" | "loop";
  office: { lat: number; lng: number; name: string };
  /** Physical stops in stored sequence order (office NOT included). */
  stops: AnalysisWaypoint[];
  /** Trips that could not be placed (missing coordinates). */
  skippedTripIds: string[];
  inputHash: string;
}

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Load a RoutePlan and turn its trip assignments into physical stops. Trips
 * sharing a coordinate (several employees at one preset point) collapse into
 * one stop. The office is appended by the analysis itself.
 */
export async function loadAnalysisInput(routePlanId: string): Promise<AnalysisInput> {
  const plan = await prisma.routePlan.findUnique({
    where: { id: routePlanId },
    include: {
      vehicle: true,
      tripAssignments: {
        include: {
          employee: { select: { fullName: true } },
          pickupAddress: true,
          pickupPoint: { include: { address: true } },
        },
        orderBy: { sequenceInTrip: "asc" },
      },
    },
  });
  if (!plan) throw new Error("Route plan not found.");

  const officeCoords = officeCoordinatesFor(plan.officeLocation ?? plan.vehicle.officeLocation);
  const office = {
    lat: plan.destinationLat ?? officeCoords.lat,
    lng: plan.destinationLng ?? officeCoords.lng,
    name: officeCoords.name,
  };

  const stops: AnalysisWaypoint[] = [];
  const byKey = new Map<string, AnalysisWaypoint>();
  const skippedTripIds: string[] = [];
  for (const t of plan.tripAssignments) {
    const preset = t.pickupType === "PRESET_POINT";
    const lat = preset ? t.pickupPoint?.address?.latitude : t.pickupAddress?.latitude;
    const lng = preset ? t.pickupPoint?.address?.longitude : t.pickupAddress?.longitude;
    if (lat == null || lng == null || (lat === 0 && lng === 0)) {
      skippedTripIds.push(t.id);
      continue;
    }
    const key = coordKey(lat, lng);
    const label = preset
      ? t.pickupPoint?.name?.trim() || t.pickupPoint?.address?.addressText || "Pickup point"
      : t.pickupAddress?.addressText ?? t.employee.fullName;
    const existing = byKey.get(key);
    if (existing) {
      existing.tripIds.push(t.id);
      existing.employeeNames.push(t.employee.fullName);
      continue;
    }
    const wp: AnalysisWaypoint = {
      index: stops.length,
      lat,
      lng,
      label,
      isOffice: false,
      tripIds: [t.id],
      employeeNames: [t.employee.fullName],
      toOfficeKm: null,
    };
    byKey.set(key, wp);
    stops.push(wp);
  }

  const topology: "chain" | "loop" = isLateNightArrivalLabel(plan.arrivalTime) ? "loop" : "chain";
  const hashSource = JSON.stringify({
    v: 1,
    routeType: plan.routeType,
    arrivalTime: plan.arrivalTime,
    office: [office.lat, office.lng],
    topology,
    trips: plan.tripAssignments.map((t) => [t.id, t.sequenceInTrip]),
    stops: stops.map((s) => [s.lat, s.lng, s.tripIds]),
  });
  const inputHash = createHash("sha1").update(hashSource).digest("hex");

  return {
    routePlanId: plan.id,
    routeType: plan.routeType,
    arrivalTime: plan.arrivalTime,
    vehicleId: plan.vehicleId,
    topology,
    office,
    stops,
    skippedTripIds,
    inputHash,
  };
}

/* ── Core computation ────────────────────────────────────────────────── */

interface Ctx {
  input: AnalysisInput;
  /** All waypoints: stops 0..n-1 then the office at index n. */
  waypoints: AnalysisWaypoint[];
  locations: Location[];
  officeIdx: number;
  notes: string[];
}

function seqLocations(ctx: Ctx, order: ReadonlyArray<number>): Location[] {
  return order.map((w) => ctx.locations[w]);
}

function currentOrder(ctx: Ctx): number[] {
  const stopIdx = ctx.input.stops.map((s) => s.index);
  return ctx.input.topology === "loop"
    ? [ctx.officeIdx, ...stopIdx, ctx.officeIdx]
    : [...stopIdx, ctx.officeIdx];
}

/** Today's map behaviour: only the first waypoint's outgoing heading is constrained. */
function legacyConstraints(ctx: Ctx, order: ReadonlyArray<number>): WaypointConstraints {
  const bearings: Array<BearingConstraint | null> = order.map(() => null);
  if (order.length >= 2) {
    const a = ctx.locations[order[0]];
    const b = ctx.locations[order[1]];
    bearings[0] = { deg: bearingDegrees(a, b), range: LEGACY_FIRST_BEARING_RANGE };
  }
  return { bearings };
}

/** Road axis per waypoint from the unconstrained pass (depart heading, else arrive). */
function roadAxis(ctx: Ctx, order: ReadonlyArray<number>, route: OsrmDetailedRoute): Array<number | null> {
  const headings = waypointHeadings(route);
  const axis: Array<number | null> = ctx.waypoints.map(() => null);
  order.forEach((w, pos) => {
    if (axis[w] != null) return;
    const h = headings[pos];
    axis[w] = h?.departDeg ?? h?.arriveDeg ?? null;
  });
  return axis;
}

/**
 * Price every (stop, side) pair in ONE table call. A `NoSegment` for a
 * candidate (e.g. a true one-way with no opposite carriageway within 70 m)
 * drops that candidate and retries; if the table keeps failing, fall back to
 * unconstrained snapping (sides unresolved, order search still works).
 */
async function priceCandidates(
  ctx: Ctx,
  initial: SideCandidate[]
): Promise<{ cands: SideCandidate[]; table: OsrmTable; resolution: "bearings" | "unconstrained" }> {
  let cands = initial;
  for (let attempt = 0; attempt < MAX_TABLE_RETRIES; attempt++) {
    try {
      const table = await getTableWithConstraints(
        cands.map((c) => ctx.locations[c.waypoint]),
        candidateConstraints(cands)
      );
      return { cands, table, resolution: "bearings" };
    } catch (error) {
      if (!(error instanceof OsrmError) || error.code !== "NoSegment" || error.coordinateIndex == null) {
        ctx.notes.push(`Side pricing failed (${error instanceof Error ? error.message : String(error)}); sides left unconstrained.`);
        break;
      }
      const idx = error.coordinateIndex;
      const bad = cands[idx];
      if (!bad) break;
      const siblings = cands.filter((c) => c.waypoint === bad.waypoint);
      if (siblings.length > 1) {
        cands = cands.filter((_, i) => i !== idx);
        ctx.notes.push(`${ctx.waypoints[bad.waypoint].label}: no road facing ${bad.headingDeg}° nearby — only one side possible.`);
      } else {
        cands = cands.map((c, i) => (i === idx ? { waypoint: c.waypoint, headingDeg: null } : c));
      }
    }
  }
  const plain = ctx.waypoints.map((w) => ({ waypoint: w.index, headingDeg: null }));
  const table = await getTableWithConstraints(plain.map((c) => ctx.locations[c.waypoint]));
  return { cands: plain, table, resolution: "unconstrained" };
}

function constraintsFor(
  cands: ReadonlyArray<SideCandidate>,
  chosen: ReadonlyArray<number>
): WaypointConstraints {
  return {
    bearings: chosen.map((c) => {
      const h = cands[c]?.headingDeg;
      return h == null ? null : { deg: h, range: SIDE_BEARING_RANGE };
    }),
    radiuses: chosen.map((c) => (cands[c]?.headingDeg == null ? null : SIDE_SNAP_RADIUS_M)),
  };
}

function buildCandidate(
  ctx: Ctx,
  id: CandidateId,
  label: string,
  description: string,
  order: ReadonlyArray<number>,
  route: OsrmDetailedRoute,
  headings: ReadonlyArray<number | null>,
  toOfficeKm: ReadonlyArray<number | null>,
  officeToFirstMinutes: number | null
): RouteCandidate {
  const stopOnly = order.filter((w) => w !== ctx.officeIdx);
  const { metrics, score } = scoreRoute(
    route,
    seqLocations(ctx, order),
    farNearViolations(stopOnly, toOfficeKm)
  );
  return {
    id,
    label,
    description,
    order: [...order],
    stops: order.map((w, pos) => ({
      waypoint: w,
      headingDeg: headings[pos] ?? null,
      snappedLat: route.waypoints[pos]?.lat ?? null,
      snappedLng: route.waypoints[pos]?.lng ?? null,
    })),
    geometry: route.geometry,
    legMinutes: route.legs.map((l) => Math.round((l.duration / 60) * 10) / 10),
    legKm: route.legs.map((l) => Math.round((l.distance / 1000) * 100) / 100),
    metrics,
    score,
    officeToFirstMinutes,
  };
}

function sameOrder(a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Run the full analysis for a loaded input. Throws when even the current
 * route cannot be routed (e.g. OSRM outage) — callers surface the message.
 */
export async function computeRouteAnalysis(input: AnalysisInput): Promise<RouteAnalysis> {
  if (input.stops.length === 0) {
    throw new Error("No stop on this route has coordinates yet — set pickup coordinates first.");
  }
  const officeWp: AnalysisWaypoint = {
    index: input.stops.length,
    lat: input.office.lat,
    lng: input.office.lng,
    label: input.office.name,
    isOffice: true,
    tripIds: [],
    employeeNames: [],
    toOfficeKm: 0,
  };
  const ctx: Ctx = {
    input,
    waypoints: [...input.stops, officeWp],
    locations: [...input.stops, officeWp].map((w) => ({ lat: w.lat, lng: w.lng, name: w.label })),
    officeIdx: input.stops.length,
    notes: [],
  };
  if (input.skippedTripIds.length > 0) {
    ctx.notes.push(`${input.skippedTripIds.length} pickup(s) without coordinates were left out of the analysis.`);
  }

  // 1) The route as drawn today (scored) + road axis at every stop.
  const order0 = currentOrder(ctx);
  const route0 = await getRouteDetailed(seqLocations(ctx, order0), legacyConstraints(ctx, order0));
  const axis = roadAxis(ctx, order0, route0);

  // 2) Price both carriageways per stop in one table.
  const constrain = ctx.waypoints.map((w) => !w.isOffice);
  const { cands, table, resolution } = await priceCandidates(
    ctx,
    buildSideCandidates(ctx.waypoints.length, axis, constrain)
  );
  const byWp = candidatesByWaypoint(cands, ctx.waypoints.length);
  const officeCand = byWp[ctx.officeIdx][0];
  const toOfficeKm: Array<number | null> = ctx.waypoints.map((w) => {
    if (w.isOffice) return 0;
    let best: number | null = null;
    for (const c of byWp[w.index]) {
      const d = table.distances[c]?.[officeCand];
      if (d != null && (best == null || d < best)) best = d;
    }
    return best == null ? null : Math.round((best / 1000) * 100) / 100;
  });
  ctx.waypoints.forEach((w, i) => {
    w.toOfficeKm = toOfficeKm[i];
  });

  const candidates: RouteCandidate[] = [];
  const noHeadings = order0.map(() => null);
  const officeToFirst = (firstStopCand: number): number | null => {
    if (input.topology === "loop") return null;
    const d = table.durations[officeCand]?.[firstStopCand];
    return d == null ? null : Math.round((d / 60) * 10) / 10;
  };

  candidates.push(
    buildCandidate(
      ctx,
      "current",
      "Current (as drawn)",
      "Stored stop order; only the first stop's heading constrained — how the map has drawn this route so far.",
      order0,
      route0,
      noHeadings,
      toOfficeKm,
      officeToFirst(byWp[order0[0]][0])
    )
  );

  // 3) Same order, best side per stop.
  const sided = chooseSides(order0, byWp, table.durations);
  if (Number.isFinite(sided.cost) && resolution === "bearings") {
    try {
      const routeS = await getRouteDetailed(seqLocations(ctx, order0), constraintsFor(cands, sided.chosen));
      candidates.push(
        buildCandidate(
          ctx,
          "current_sided",
          "Current order, right side of road",
          "Same stop order; at every stop the vehicle stops on the carriageway that already faces the next stop (no loop-around).",
          order0,
          routeS,
          sided.chosen.map((c) => cands[c].headingDeg),
          toOfficeKm,
          officeToFirst(sided.chosen[0])
        )
      );
    } catch (error) {
      ctx.notes.push(`Side-aware route could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (resolution === "unconstrained") {
    ctx.notes.push("Road sides could not be priced on this route; only the stop order was compared.");
  }

  // 4) Order + sides optimized jointly.
  const stopIdx = input.stops.map((s) => s.index);
  const best = searchOrder({
    stops: stopIdx,
    start: input.topology === "loop" ? ctx.officeIdx : null,
    end: ctx.officeIdx,
    byWaypoint: byWp,
    durations: table.durations,
  });
  if (!sameOrder(best.order, order0) && Number.isFinite(best.sides.cost)) {
    try {
      const routeO = await getRouteDetailed(seqLocations(ctx, best.order), constraintsFor(cands, best.sides.chosen));
      candidates.push(
        buildCandidate(
          ctx,
          "optimized",
          "Optimized order",
          "Shortest drive found by testing every stop order together with the side of road at each stop.",
          best.order,
          routeO,
          best.sides.chosen.map((c) => cands[c].headingDeg),
          toOfficeKm,
          officeToFirst(best.sides.chosen[0])
        )
      );
    } catch (error) {
      ctx.notes.push(`Optimized route could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (sameOrder(best.order, order0)) {
    ctx.notes.push("The stored stop order is already the shortest — no reordering proposed.");
  }

  // Recommend the lowest score; ties keep the least change (list order).
  let recommended = candidates[0];
  for (const c of candidates) {
    if (c.score < recommended.score - 1e-9) recommended = c;
  }

  return {
    version: 1,
    computedAt: new Date().toISOString(),
    inputHash: input.inputHash,
    topology: input.topology,
    sideResolution: resolution,
    waypoints: ctx.waypoints,
    candidates,
    recommendedId: recommended.id,
    notes: ctx.notes,
  };
}
