import assert from "node:assert/strict";
import test from "node:test";
import {
  formatShortDate,
  getMondayOfWeek,
  getSubmissionWindow,
  getWeekDays,
  normalizeWeekStart,
  parseDayKey,
  toUtcMidnight,
} from "../week";

// Week-sync regression: Operations MDS submissions must land on the canonical
// UTC-midnight Monday of the Dhaka-calendar week, and every Mon–Fri label
// must render the same dates on any host timezone (the 11-Oct-instead-of-12
// class of off-by-one). These tests hold regardless of host TZ because the
// helpers never touch it (verified: TZ=UTC, Asia/Dhaka, America/Chicago).

test("toUtcMidnight maps a Dhaka-midnight instant to its Monday key", () => {
  // Sun 2026-10-11 18:00Z == Mon 2026-10-12 00:00 Asia/Dhaka.
  assert.equal(
    toUtcMidnight(new Date("2026-10-11T18:00:00.000Z")).toISOString(),
    "2026-10-12T00:00:00.000Z"
  );
  // Idempotent on canonical keys.
  assert.equal(
    toUtcMidnight(new Date("2026-10-12T00:00:00.000Z")).toISOString(),
    "2026-10-12T00:00:00.000Z"
  );
});

test("getMondayOfWeek returns the canonical Monday for any weekday", () => {
  // Monday midday UTC -> same Monday key.
  assert.equal(
    getMondayOfWeek(new Date("2026-10-12T12:00:00.000Z")).toISOString(),
    "2026-10-12T00:00:00.000Z"
  );
  // Friday evening Dhaka (Fri 2026-10-16 20:00 +06 = 14:00Z) -> Monday 12th.
  assert.equal(
    getMondayOfWeek(new Date("2026-10-16T14:00:00.000Z")).toISOString(),
    "2026-10-12T00:00:00.000Z"
  );
  // Sunday -> previous Monday, not the Sunday itself.
  assert.equal(
    getMondayOfWeek(new Date("2026-10-11T10:00:00.000Z")).toISOString(),
    "2026-10-05T00:00:00.000Z"
  );
});

test("normalizeWeekStart heals legacy Sunday-18:00Z keys", () => {
  assert.equal(
    normalizeWeekStart(new Date("2026-08-02T18:00:00.000Z")).toISOString(),
    "2026-08-03T00:00:00.000Z"
  );
});

test("getWeekDays always spans Mon–Fri 12 Oct – 16 Oct, even from a Sunday key", () => {
  for (const input of [
    "2026-10-12T00:00:00.000Z", // canonical Monday
    "2026-10-11T18:00:00.000Z", // legacy Dhaka-midnight (Sunday UTC)
    "2026-10-14T09:30:00.000Z", // mid-week
  ]) {
    const days = getWeekDays(new Date(input));
    assert.equal(days.length, 5);
    assert.deepEqual(
      days.map((d) => d.toISOString()),
      [
        "2026-10-12T00:00:00.000Z",
        "2026-10-13T00:00:00.000Z",
        "2026-10-14T00:00:00.000Z",
        "2026-10-15T00:00:00.000Z",
        "2026-10-16T00:00:00.000Z",
      ]
    );
  }
});

test("formatShortDate renders Monday 12 Oct – Friday 16 Oct", () => {
  const days = getWeekDays(new Date("2026-10-12T00:00:00.000Z"));
  assert.equal(formatShortDate(days[0]), "12 Oct");
  assert.equal(formatShortDate(days[4]), "16 Oct");
});

test("parseDayKey parses calendar dates independent of host timezone", () => {
  assert.equal(parseDayKey("2026-10-12").toISOString(), "2026-10-12T00:00:00.000Z");
  assert.ok(Number.isNaN(parseDayKey("not-a-date").getTime()));
  assert.ok(Number.isNaN(parseDayKey("2026-02-30").getTime()));
  assert.ok(Number.isNaN(parseDayKey("2026-13-01").getTime()));
});

test("submission window on Mon 12 Oct targets Mon 19 Oct with Sat 12:00 Dhaka deadline", () => {
  const window = getSubmissionWindow(new Date("2026-10-12T10:00:00.000Z"));
  assert.equal(window.weekStartDate.toISOString(), "2026-10-19T00:00:00.000Z");
  // Saturday 12:00 Asia/Dhaka == 06:00Z.
  assert.equal(window.deadline.toISOString(), "2026-10-17T06:00:00.000Z");
  assert.equal(window.isOpen, true);
});

test("submission window rolls forward after the Saturday-noon deadline", () => {
  // Saturday 13:00 Dhaka == 07:00Z, past the noon lock.
  const window = getSubmissionWindow(new Date("2026-10-17T07:00:00.000Z"));
  assert.equal(window.weekStartDate.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(window.deadline.toISOString(), "2026-10-24T06:00:00.000Z");
});
