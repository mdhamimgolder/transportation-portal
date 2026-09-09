import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSideCandidates,
  candidatesByWaypoint,
  chooseSides,
  searchOrder,
  scoreRoute,
  backtrackKm,
  countUturns,
  countLoopArounds,
  farNearViolations,
} from "../side-selection";
import type { OsrmDetailedRoute } from "../osrm";
import {
  bearingsParam,
  radiusesParam,
  headingDifference,
  parseNoSegmentIndex,
} from "../utils";
import { backCalculatePickupMinutes } from "../schedule-math";

test("buildSideCandidates: two headings per constrained stop, one for the office", () => {
  const c = buildSideCandidates(3, [10, 350, null], [true, true, false]);
  assert.deepEqual(c, [
    { waypoint: 0, headingDeg: 10 },
    { waypoint: 0, headingDeg: 190 },
    { waypoint: 1, headingDeg: 350 },
    { waypoint: 1, headingDeg: 170 },
    { waypoint: 2, headingDeg: null },
  ]);
  const by = candidatesByWaypoint(c, 3);
  assert.deepEqual(by, [[0, 1], [2, 3], [4]]);
});

test("chooseSides: picks the carriageway that avoids the loop-around", () => {
  // Waypoints: 0 = Zigatola (cands 0,1), 1 = Dhanmondi 15 (cands 2,3), 2 = office (cand 4).
  // Candidate 0 (wrong side) needs a long loop to reach either Dhanmondi side.
  const INF = null;
  const d: (number | null)[][] = [
    //      0    1    2    3    4
    /*0*/ [0, INF, 900, 950, 1500],
    /*1*/ [INF, 0, 300, 420, 1200],
    /*2*/ [INF, INF, 0, INF, 600],
    /*3*/ [INF, INF, INF, 0, 480],
    /*4*/ [INF, INF, INF, INF, 0],
  ];
  const by = [[0, 1], [2, 3], [4]];
  const r = chooseSides([0, 1, 2], by, d);
  assert.equal(r.cost, 300 + 600);
  assert.deepEqual(r.chosen, [1, 2, 4]);
});

test("chooseSides: unroutable when no candidate chain connects", () => {
  const d: (number | null)[][] = [
    [0, null],
    [null, 0],
  ];
  const r = chooseSides([0, 1], [[0], [1]], d);
  assert.equal(r.cost, Infinity);
});

test("searchOrder: exhaustive search finds the optimum with the office fixed last", () => {
  // Stops A(0) B(1) C(2), office(3). Only order B→A→C→office is cheap.
  const big = 10_000;
  const d: number[][] = [
    // to:  A     B     C    office
    /*A*/ [0, big, 100, big],
    /*B*/ [100, 0, big, big],
    /*C*/ [big, big, 0, 100],
    /*O*/ [big, big, big, 0],
  ];
  const by = [[0], [1], [2], [3]];
  const r = searchOrder({ stops: [0, 1, 2], start: null, end: 3, byWaypoint: by, durations: d });
  assert.deepEqual(r.order, [1, 0, 2, 3]);
  assert.equal(r.sides.cost, 300);
});

test("searchOrder: keeps the input order when nothing is better (ties)", () => {
  const d: number[][] = [
    [0, 100, 100],
    [100, 0, 100],
    [100, 100, 0],
  ];
  const r = searchOrder({ stops: [0, 1], start: null, end: 2, byWaypoint: [[0], [1], [2]], durations: d });
  assert.deepEqual(r.order, [0, 1, 2]);
});

test("searchOrder: Or-opt path (above exhaustive limit) still improves", () => {
  // 5 stops on a line at x=0..4, office at x=5; start order reversed.
  const pts = [0, 1, 2, 3, 4, 5];
  const d = pts.map((a) => pts.map((b) => Math.abs(a - b) * 60));
  const by = pts.map((_, i) => [i]);
  const r = searchOrder({
    stops: [4, 3, 2, 1, 0],
    start: null,
    end: 5,
    byWaypoint: by,
    durations: d,
    maxExhaustive: 2,
  });
  assert.deepEqual(r.order, [0, 1, 2, 3, 4, 5]);
});

function step(
  type: string,
  before: number,
  after: number,
  modifier?: string
): OsrmDetailedRoute["legs"][number]["steps"][number] {
  return {
    distance: 100,
    duration: 10,
    maneuver: { type, modifier, bearing_before: before, bearing_after: after, location: [90.4, 23.7] },
  };
}

const fixture: OsrmDetailedRoute = {
  distance: 4000,
  duration: 600,
  waypoints: [],
  geometry: [],
  legs: [
    {
      distance: 2000,
      duration: 300,
      steps: [step("depart", 0, 90), step("turn", 90, 270, "uturn"), step("arrive", 270, 0)],
      annotation: { nodes: [1, 2, 3, 2, 1], distance: [100, 100, 100, 100] },
    },
    {
      distance: 2000,
      duration: 300,
      // arrives heading 270 at waypoint 1, departs heading 90 → loop-around
      steps: [step("depart", 0, 90), step("arrive", 90, 0)],
      annotation: { nodes: [1, 5, 6], distance: [100, 100] },
    },
  ],
};

test("scoreRoute: counts U-turns, loop-arounds and backtracked km", () => {
  assert.equal(countUturns(fixture), 1);
  assert.equal(countLoopArounds(fixture), 1);
  // Edges 1-2, 2-3 seen; 3-2 and 2-1 repeated (200 m); leg 2's 1-5, 5-6 new.
  assert.equal(backtrackKm(fixture), 0.2);
  const { metrics, score } = scoreRoute(
    fixture,
    [
      { lat: 23.7, lng: 90.4 },
      { lat: 23.71, lng: 90.4 },
      { lat: 23.72, lng: 90.4 },
    ],
    0
  );
  assert.equal(metrics.durationMin, 10);
  assert.equal(metrics.distanceKm, 4);
  assert.equal(metrics.uturns, 1);
  assert.equal(metrics.loopArounds, 1);
  assert.equal(metrics.backtrackKm, 0.2);
  assert.ok(metrics.detourRatio > 1);
  assert.equal(score, 10 + 3 + 2 + 1);
});

test("farNearViolations: strictly far→near is 0, an increase counts", () => {
  assert.equal(farNearViolations([0, 1, 2], [9, 6, 3]), 0);
  assert.equal(farNearViolations([0, 1, 2], [6, 9, 3]), 1);
});

test("parseNoSegmentIndex + query builders", () => {
  assert.equal(parseNoSegmentIndex("Could not find a matching segment for coordinate 3"), 3);
  assert.equal(parseNoSegmentIndex("nope"), null);
  assert.equal(bearingsParam([{ deg: 370, range: 60 }, null, { deg: -10, range: 45 }]), "10,60;;350,45");
  assert.equal(bearingsParam([null, null]), "");
  assert.equal(radiusesParam([70, null]), "70;unlimited");
  assert.equal(headingDifference(350, 10), 20);
});

test("backCalculatePickupMinutes: 5-minute grid, ≥5 min gaps, arrival kept", () => {
  // arrival 23:00 = 1380; legs to next: [7, 4, 6] → raw 1363 / 1370 / 1374
  // → grid 1360 / 1365 / 1370 (each ≥ 5 min before the next).
  const r = backCalculatePickupMinutes(1380, [7, 4, 6]);
  assert.deepEqual(r, [1360, 1365, 1370]);
  assert.throws(() => backCalculatePickupMinutes(30, [20, 20]));
});
