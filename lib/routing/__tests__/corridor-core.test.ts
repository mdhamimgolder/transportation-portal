import assert from "node:assert/strict";
import test from "node:test";
import {
  planCorridorRoutes,
  type ClusterMember,
} from "../corridor-core";

function member(
  id: string,
  matrixIndex: number,
  latitude: number,
  longitude: number,
  toOfficeKm: number
): ClusterMember {
  const employee = {
    id,
    fullName: id,
    address: null,
    pickupPoint: null,
    homeAddressId: id,
    officeLocation: "Regnum",
    pickupAddressId: null,
    homeAddress: null,
    pickupAddress: null,
  };
  const home = {
    id,
    addressText: id,
    latitude,
    longitude,
  };
  return {
    schedule: {
      id: `schedule-${id}`,
      dayOfWeek: 1,
      arrivalTime: "11 PM",
      weeklySchedule: {
        weekStartDate: new Date("2026-08-24T00:00:00.000Z"),
        employee,
      },
    },
    employee,
    home,
    matrixIndex,
    toOfficeMin: toOfficeKm,
    toOfficeKm,
  };
}

test("growth skips an out-of-radius nearest candidate and considers the next", () => {
  const anchor = member("anchor", 1, 23.8, 90.4, 100);
  const outsideRadius = member("outside", 2, 23.8, 90.45, 90);
  const nearby = member("nearby", 3, 23.801, 90.401, 80);
  const matrixMinutes = new Map([
    ["1|0", 100], ["2|0", 90], ["3|0", 80],
    ["1|2", 1], ["1|3", 2], ["3|0", 80],
  ]);
  const matrixKm = new Map([
    ["1|0", 100], ["2|0", 90], ["3|0", 80],
    ["1|2", 1.1], ["1|3", 0.2],
    ["2|0", 90], ["3|0", 80],
  ]);

  const result = planCorridorRoutes({
    members: [anchor, outsideRadius, nearby],
    pool: [
      { id: "vehicle-1", officeLocation: "Regnum", capacity: 2 },
      { id: "vehicle-2", officeLocation: "Regnum", capacity: 2 },
    ],
    allVehicles: [],
    officeKey: "Regnum",
    office: { lat: 23.7, lng: 90.3 },
    isSameOffice: (location, key) => location === key,
    arrivalLabel: "11 PM",
    dMin: (from, to) => matrixMinutes.get(`${from}|${to}`) ?? 20,
    dKm: (from, to) => matrixKm.get(`${from}|${to}`) ?? 20,
    legRoadKm: () => null,
  });

  assert.deepEqual(
    result.routes[0].order.map((stop) => stop.employee.id),
    ["anchor", "nearby"]
  );
});

test("corridor attach preserves a far-first anchor and inserts at the best leg", () => {
  const anchor = member("anchor", 1, 23.8, 90.4, 100);
  const middle = member("middle", 2, 23.801, 90.401, 90);
  const curve = member("curve", 3, 23.8005, 90.4005, 96);
  const minutes = new Map([
    ["1|0", 100], ["2|0", 90], ["3|0", 96],
    ["1|2", 5], ["1|3", 6], ["2|3", 3], ["3|2", 1],
  ]);
  const distance = new Map([
    ["1|0", 100], ["2|0", 90], ["3|0", 96],
    ["1|2", 1], ["1|3", 1], ["2|3", 1],
  ]);

  const result = planCorridorRoutes({
    members: [anchor, middle, curve],
    pool: [{ id: "vehicle-1", officeLocation: "Regnum", capacity: 3 }],
    allVehicles: [],
    officeKey: "Regnum",
    office: { lat: 23.7, lng: 90.3 },
    isSameOffice: (location, key) => location === key,
    arrivalLabel: "11 PM",
    dMin: (from, to) => minutes.get(`${from}|${to}`) ?? 20,
    dKm: (from, to) => distance.get(`${from}|${to}`) ?? 20,
    legRoadKm: (candidate, from, to) => {
      if (candidate.employee.id !== "curve") return null;
      if (from.employee.id === "anchor" && to?.employee.id === "middle") return 0.1;
      if (from.employee.id === "middle" && to === null) return 0.8;
      return null;
    },
  });

  assert.deepEqual(
    result.routes.map((route) => route.order.map((stop) => stop.employee.id)),
    [["anchor", "curve", "middle"]]
  );
});