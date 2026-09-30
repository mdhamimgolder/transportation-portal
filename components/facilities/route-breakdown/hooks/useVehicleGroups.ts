"use client";

import { useMemo } from "react";
import type { GeneratedRouteDetail, GeneratedRouteTrip } from "@/actions/route-generation.actions";

export interface ShiftSection {
  arrivalTime: string;
  route: GeneratedRouteDetail;
  trips: GeneratedRouteTrip[];
}

export interface VehicleGroup {
  vehicleId: string;
  vehicleNumber: string | null;
  vehicleType: string | null;
  capacity: number | null;
  driverName: string | null;
  driverContact: string | null;
  officeLocation: string | null;
  shifts: ShiftSection[];
  isPinnedNotMapped: boolean;
  pinnedVehicleId?: string;
}

function normalizeArrival(arrival: string): string {
  return arrival.trim().toUpperCase().replace(/\s+/g, "");
}

const SHIFT_ORDER: Record<string, number> = {
  "10PM": 0,
  "11PM": 1,
  "12AM": 2,
  "1AM": 3,
  "2AM": 4,
  "3AM": 5,
  "4AM": 6,
  "5AM": 7,
  "6AM": 8,
};

function shiftSortKey(arrival: string): number {
  const norm = normalizeArrival(arrival);
  return SHIFT_ORDER[norm] ?? 99;
}

export function useVehicleGroups(routes: GeneratedRouteDetail[]): VehicleGroup[] {
  return useMemo(() => {
    const groups = new Map<string, VehicleGroup>();

    for (const route of routes) {
      const vehicleId = route.vehicleId;
      const isPinnedNotMapped = route.pinnedNotMapped === true;

      let group = groups.get(vehicleId);
      if (!group) {
        group = {
          vehicleId,
          vehicleNumber: route.vehicle?.vehicleNumber ?? null,
          vehicleType: route.vehicle?.vehicleType ?? null,
          capacity: route.vehicle?.capacity ?? null,
          driverName: route.vehicle?.driverName ?? null,
          driverContact: route.vehicle?.driverContact ?? null,
          officeLocation: route.vehicle?.officeLocation ?? null,
          shifts: [],
          isPinnedNotMapped,
          pinnedVehicleId: isPinnedNotMapped ? vehicleId : undefined,
        };
        groups.set(vehicleId, group);
      }

      if (isPinnedNotMapped && route.trips.length === 0) {
        continue;
      }

      const sortedTrips = [...route.trips].sort((a, b) => a.sequenceInTrip - b.sequenceInTrip);

      group.shifts.push({
        arrivalTime: route.arrivalTime,
        route,
        trips: sortedTrips,
      });
    }

    const result = Array.from(groups.values());

    for (const group of result) {
      group.shifts.sort((a, b) => shiftSortKey(a.arrivalTime) - shiftSortKey(b.arrivalTime));
    }

    result.sort((a, b) => {
      const aNum = a.vehicleNumber ? a.vehicleNumber.replace(/\D/g, "") : "9999";
      const bNum = b.vehicleNumber ? b.vehicleNumber.replace(/\D/g, "") : "9999";
      return Number(aNum) - Number(bNum);
    });

    return result;
  }, [routes]);
}

export function flattenTrips(groups: VehicleGroup[]): { trip: GeneratedRouteTrip; routeId: string; arrivalTime: string; vehicleId: string }[] {
  const result: { trip: GeneratedRouteTrip; routeId: string; arrivalTime: string; vehicleId: string }[] = [];
  for (const group of groups) {
    for (const shift of group.shifts) {
      for (const trip of shift.trips) {
        result.push({
          trip,
          routeId: shift.route.id,
          arrivalTime: shift.arrivalTime,
          vehicleId: group.vehicleId,
        });
      }
    }
  }
  return result;
}