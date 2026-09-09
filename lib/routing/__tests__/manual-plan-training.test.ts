import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseClockTime,
  shiftKeyForShiftLabel,
  legObservationsFromManualEntries,
  type ManualEntryLike,
} from "../manual-plan-training";

function entry(overrides: Partial<ManualEntryLike>): ManualEntryLike {
  return {
    id: "e1",
    date: "2026-09-07T00:00:00.000Z",
    shiftKey: "10PM",
    vehicleNumber: "DHKA-1245",
    addressId: "addr-1",
    pickupLabel: "Zigatola",
    pickupMinutes: 20 * 60 + 35,
    orderIndex: null,
    officeLabel: "Regnum",
    arrivalMinutes: 22 * 60,
    ...overrides,
  };
}

test("parseClockTime: 24h, 12h, and rejects garbage", () => {
  assert.equal(parseClockTime("20:35"), 1235);
  assert.equal(parseClockTime("8:35 PM"), 1235);
  assert.equal(parseClockTime("12:05 AM"), 5);
  assert.equal(parseClockTime("12:05 PM"), 725);
  assert.equal(parseClockTime("00:05"), 5);
  assert.equal(parseClockTime("24:00"), 1440);
  assert.equal(parseClockTime("24:01"), null);
  assert.equal(parseClockTime("25:00"), null);
  assert.equal(parseClockTime("13:00 PM"), null);
  assert.equal(parseClockTime("abc"), null);
  assert.equal(parseClockTime(""), null);
  assert.equal(parseClockTime(null), null);
});

test("shiftKeyForShiftLabel: accepts spaced, compact, and late-night labels", () => {
  assert.equal(shiftKeyForShiftLabel("10 PM"), "10PM");
  assert.equal(shiftKeyForShiftLabel("10PM"), "10PM");
  assert.equal(shiftKeyForShiftLabel("11 pm"), "11PM");
  assert.equal(shiftKeyForShiftLabel("12 AM"), "12AM-6AM");
  assert.equal(shiftKeyForShiftLabel("3 AM"), "12AM-6AM");
  assert.equal(shiftKeyForShiftLabel("late night"), "12AM-6AM");
  assert.equal(shiftKeyForShiftLabel("9 PM"), null);
  assert.equal(shiftKeyForShiftLabel(""), null);
});

test("legObservations: consecutive gaps + last pickup to office", () => {
  const { observations, issues } = legObservationsFromManualEntries([
    entry({ id: "a", addressId: "A", pickupLabel: "Zigatola", pickupMinutes: 1235, orderIndex: 1 }),
    entry({ id: "b", addressId: "B", pickupLabel: "Dhanmondi 15", pickupMinutes: 1242, orderIndex: 2 }),
    entry({ id: "c", addressId: "C", pickupLabel: "Green Road", pickupMinutes: 1251, orderIndex: 3 }),
  ]);
  assert.equal(issues.length, 0);
  assert.deepEqual(
    observations.map((o) => [o.fromKey, o.toKey, o.gapMinutes]),
    [
      ["addr:A", "addr:B", 7],
      ["addr:B", "addr:C", 9],
      ["addr:C", "office:Regnum", 69], // 22:00 - 20:51
    ]
  );
  assert.ok(observations.every((o) => o.shiftKey === "10PM"));
});

test("legObservations: midnight-crossing late-night run orders chronologically", () => {
  const { observations, issues } = legObservationsFromManualEntries([
    entry({ id: "a", addressId: "A", pickupLabel: "Mirpur 10", pickupMinutes: 23 * 60 + 40, orderIndex: 1, shiftKey: "12AM-6AM", arrivalMinutes: 60 }),
    entry({ id: "b", addressId: "B", pickupLabel: "Kazipara", pickupMinutes: 5, orderIndex: 2, shiftKey: "12AM-6AM", arrivalMinutes: 60 }),
  ]);
  assert.equal(issues.length, 0);
  assert.deepEqual(
    observations.map((o) => [o.fromKey, o.toKey, o.gapMinutes]),
    [
      ["addr:A", "addr:B", 25], // 23:40 -> 00:05
      ["addr:B", "office:Regnum", 55], // 00:05 -> 1:00 AM
    ]
  );
});

test("legObservations: rows are grouped per date+shift+vehicle", () => {
  const { observations } = legObservationsFromManualEntries([
    entry({ id: "a", addressId: "A", pickupMinutes: 1235, vehicleNumber: "V1" }),
    entry({ id: "b", addressId: "B", pickupMinutes: 1245, vehicleNumber: "V1" }),
    entry({ id: "c", addressId: "C", pickupMinutes: 1240, vehicleNumber: "V2" }),
    entry({
      id: "d",
      addressId: "D",
      pickupMinutes: 1250,
      vehicleNumber: "V1",
      date: "2026-09-08T00:00:00.000Z",
    }),
  ]);
  // V1 same day: A->B (10) + B->office; V2 alone: C->office; next day D->office.
  const legs = observations.map((o) => `${o.fromKey}>${o.toKey}:${o.gapMinutes}`).sort();
  assert.deepEqual(legs, [
    "addr:A>addr:B:10",
    "addr:B>office:Regnum:75",
    "addr:C>office:Regnum:80",
    "addr:D>office:Regnum:70",
  ]);
});

test("legObservations: arrival before the last pickup is reported, no office leg", () => {
  // Pickup 22:10 with a 22:00 arrival is impossible — no valid office leg.
  const { observations, issues } = legObservationsFromManualEntries([
    entry({ id: "a", addressId: "A", pickupMinutes: 1330, arrivalMinutes: 1320 }),
  ]);
  assert.equal(observations.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /out of range/);
});

test("legObservations: entries without an address are skipped quietly", () => {
  const { observations, issues } = legObservationsFromManualEntries([
    entry({ id: "a", addressId: null }),
    entry({ id: "b", addressId: "B", pickupMinutes: 1240 }),
  ]);
  assert.equal(issues.length, 0);
  assert.deepEqual(observations.map((o) => o.fromKey), ["addr:B"]);
});

test("legObservations: modal arrival tolerates one typo row", () => {
  const { observations, issues } = legObservationsFromManualEntries([
    entry({ id: "a", addressId: "A", pickupMinutes: 1235, arrivalMinutes: 1320 }),
    entry({ id: "b", addressId: "B", pickupMinutes: 1245, arrivalMinutes: 1320 }),
    entry({ id: "c", addressId: "C", pickupMinutes: 1251, arrivalMinutes: 1380 }), // typo
  ]);
  assert.equal(issues.length, 0);
  const lastToOffice = observations.find((o) => o.toKey === "office:Regnum");
  assert.equal(lastToOffice?.gapMinutes, 69); // anchored on the modal 22:00
});
