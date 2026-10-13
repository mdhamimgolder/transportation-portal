import assert from "node:assert/strict";
import test from "node:test";
import {
  eligibleAdhocArrivalOptions,
  isAdhocArrivalEligible,
  resolveAdhocArrival,
} from "../../constants/adhoc-arrival-times";

// Regression: ad-hoc arrival resolution must use explicit Asia/Dhaka
// wall-clock math, never host-local setHours — otherwise the same base key
// resolves to different UTC instants on UTC vs Dhaka hosts, and a wrong
// device timezone skews the 3-hour eligibility cutoff.
const BASE = new Date(Date.UTC(2026, 9, 13)); // Tue 13 Oct Dhaka date key

test("resolveAdhocArrival maps overnight slots to Dhaka wall-clock instants", () => {
  // 22:00 Dhaka == 16:00Z same day.
  assert.equal(
    resolveAdhocArrival(BASE, "22:00").toISOString(),
    "2026-10-13T16:00:00.000Z"
  );
  // 23:00 Dhaka == 17:00Z same day.
  assert.equal(
    resolveAdhocArrival(BASE, "23:00").toISOString(),
    "2026-10-13T17:00:00.000Z"
  );
  // 00:00-06:00 are next-morning Dhaka (next UTC day, minus 6h offset).
  assert.equal(
    resolveAdhocArrival(BASE, "00:00").toISOString(),
    "2026-10-13T18:00:00.000Z"
  );
  assert.equal(
    resolveAdhocArrival(BASE, "06:00").toISOString(),
    "2026-10-14T00:00:00.000Z"
  );
});

test("3-hour cutoff is evaluated against the provided now, not device clock", () => {
  // Dhaka Tue 19:00 == 13:00Z. +3h => earliest 22:00 Dhaka.
  const now = new Date("2026-10-13T13:00:00.000Z");
  assert.equal(isAdhocArrivalEligible(BASE, "22:00", now), true);
  assert.equal(
    eligibleAdhocArrivalOptions(BASE, now).map((o) => o.value).includes("22:00"),
    true
  );
  // One minute earlier (18:59 Dhaka) => 22:00 is only 3h01m away? No:
  // 18:59 + 3h = 21:59, so 22:00 still eligible. Use 19:01 Dhaka => cutoff
  // 22:01, so 22:00 must be excluded.
  const late = new Date("2026-10-13T13:01:00.000Z");
  assert.equal(isAdhocArrivalEligible(BASE, "22:00", late), false);
  assert.equal(isAdhocArrivalEligible(BASE, "23:00", late), true);
});
