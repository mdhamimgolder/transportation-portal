import assert from "node:assert/strict";
import test from "node:test";
import { manualRouteGeometrySchema } from "../schemas";

const validAdjustment = {
  routePlanId: "route-1",
  geometry: [
    [23.78, 90.41],
    [23.79, 90.42],
  ],
  viaPoints: [{ lat: 23.785, lng: 90.415 }],
  totals: { minutes: 45, km: 18.5 },
};

test("manual route geometry accepts valid coordinates and bounded totals", () => {
  assert.equal(manualRouteGeometrySchema.safeParse(validAdjustment).success, true);
});

test("manual route geometry rejects out-of-range coordinates and oversized arrays", () => {
  assert.equal(
    manualRouteGeometrySchema.safeParse({
      ...validAdjustment,
      geometry: [[91, 90], [23, 90]],
    }).success,
    false
  );
  assert.equal(
    manualRouteGeometrySchema.safeParse({
      ...validAdjustment,
      viaPoints: Array.from({ length: 101 }, () => ({ lat: 23, lng: 90 })),
    }).success,
    false
  );
});