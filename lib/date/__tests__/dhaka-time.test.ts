import assert from "node:assert/strict";
import test from "node:test";
import {
  addUtcCalendarDays,
  dhakaDateTimeFromMinutes,
  dhakaMinutesOfDay,
} from "../week";

test("Dhaka wall-clock times map to the correct UTC instant", () => {
  const day = new Date(Date.UTC(2026, 8, 24));

  assert.equal(
    dhakaDateTimeFromMinutes(day, 22 * 60).toISOString(),
    "2026-09-24T16:00:00.000Z"
  );
  assert.equal(
    dhakaDateTimeFromMinutes(day, 25 * 60).toISOString(),
    "2026-09-24T19:00:00.000Z"
  );
});

test("UTC instants read back as Dhaka minutes independent of host timezone", () => {
  assert.equal(
    dhakaMinutesOfDay(new Date("2026-09-24T16:00:00.000Z")),
    22 * 60
  );
  assert.equal(
    dhakaMinutesOfDay(new Date("2026-09-25T19:00:00.000Z")),
    60
  );
});

test("UTC calendar-day addition preserves date keys", () => {
  const day = new Date(Date.UTC(2026, 8, 24));
  assert.equal(
    addUtcCalendarDays(day, 2).toISOString(),
    "2026-09-26T00:00:00.000Z"
  );
});