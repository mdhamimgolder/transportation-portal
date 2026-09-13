/**
 * Single source of truth for a vehicle's pickup-point schedule times.
 *
 * Drive rule ("the 5-minute rule"):
 *  - between any two pickup points — and between the last point and the office —
 *    straight-line km × 5 minutes is the drive time (Math.ceil per leg);
 *  - when the journey planner has been TRAINED on history (see the
 *    RouteLegLearning table), a learned average gap for the same leg replaces
 *    the distance estimate once it has >= LEARN_MIN_SAMPLES observations.
 *
 * Time grid ("5-minute pickup times"):
 *  - every pickup time (and the derived office arrival) lands on a 5-minute
 *    increment, e.g. 10:25, 10:30, 10:35, ... ;
 *  - consecutive pickups (and the last pickup -> office arrival) are always at
 *    least 5 minutes apart — guaranteed by snapping equal or smaller.
 *
 * The schedule is anchored either:
 *  - FORWARD from the vehicle's FIRST PICKUP TIME (set by Facilities): the
 *    first point is picked up at that time (rounded UP to the grid) and every
 *    later point is previous + drive. Office arrival is derived (last pickup +
 *    drive to office, rounded up).
 *  - BACKWARD from the vehicle's BASE ETA (default office arrival): the last
 *    point is picked up at "BASE ETA − drive to office" (rounded DOWN), walking
 *    back to the first point.
 *
 * `syncPickupPointTimes` persists the computed times onto each pickup point's
 * `baseETA` (drive-used for display) and is called after any point create /
 * update / delete / reorder and after a vehicle's first-pickup-time edit.
 * It uses the 10 PM learned set, since preset points are the 10 PM trips.
 */

import { prisma } from "@/lib/prisma";
import { haversineDistance, minutesToTimeString } from "./utils";
import { officeCoordinatesFor } from "@/lib/constants/office-locations";
import {
  PICKUP_GRID_MINUTES,
  snapPickupMinutesDown,
  snapPickupMinutesUp,
} from "./schedule-math";

export {
  PICKUP_GRID_MINUTES,
  snapPickupMinutesDown,
  snapPickupMinutesUp,
  backCalculatePickupMinutes,
} from "./schedule-math";

/** City-speed assumption: 1 km of driving takes ~5 minutes. */
export const MINUTES_PER_KM = 5;

/** A learned leg is trusted once it has at least this many observations. */
export const LEARN_MIN_SAMPLES = 3;

export type LearnedLeg = {
  avgMinutes: number;
  sampleCount: number;
  min: number;
  max: number;
};

/** Learned leg lookup, keyed `${fromKey}->${toKey}`. */
export type LearnedResolver = Map<string, LearnedLeg>;

export type SchedulePointInput = {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Learning key, e.g. "addr:<addressId>". Null = no learning for that leg. */
  key?: string | null;
};

export type PickupAnchor = {
  firstPickupTime: string | null;
  baseETA: string | null;
  /**
   * Office arrival to anchor the schedule on when neither `firstPickupTime`
   * nor `baseETA` is set on the vehicle. This is the shift's default arrival
   * (10 PM → 22:00), so the pickup times are back-calculated from taught /
   * learned leg gaps instead of a manually entered anchor.
   */
  defaultArrival?: string | null;
};

export type PickupScheduleResult =
  | {
      success: true;
      method: "first_pickup" | "base_eta";
      /** Per-point computed pickup times, in sequence order. */
      points: Array<{ id: string; pickup: string }>;
      /** Derived office arrival (forward) or the base ETA itself (backward). */
      officeArrival: string;
    }
  | { success: false; error: string };

export type OfficeCoordsLike = { lat: number; lng: number; name?: string };

function normalizeTime(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [h, m] = value.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}


function legKey(fromKey: string | null | undefined, toKey: string | null | undefined): string | null {
  return fromKey && toKey ? `${fromKey}->${toKey}` : null;
}

/**
 * Drive minutes for one leg: a learned median (>= LEARN_MIN_SAMPLES samples)
 * when the resolver knows the pair, otherwise distance × 5 min/km. Never < 1.
 */
export function driveLegMinutes(
  a: { latitude: number; longitude: number; key?: string | null },
  b: { latitude: number; longitude: number; key?: string | null },
  learned?: LearnedResolver,
  officeName?: string
): number {
  const aKey = a.key ?? (officeName ? `office:${officeName}` : null);
  const learnedMinutes = learned?.get(legKey(aKey, b.key ?? (officeName ? `office:${officeName}` : null)) ?? "");
  if (learnedMinutes && learnedMinutes.sampleCount >= LEARN_MIN_SAMPLES) {
    return Math.max(1, Math.round(learnedMinutes.avgMinutes));
  }
  return Math.max(
    1,
    Math.ceil(
      haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude) * MINUTES_PER_KM
    )
  );
}

export function computePickupSchedule(
  anchor: PickupAnchor,
  points: SchedulePointInput[],
  office: OfficeCoordsLike,
  learned?: LearnedResolver
): PickupScheduleResult {
  if (points.length === 0) {
    return { success: false, error: "Vehicle has no pickup points." };
  }

  const missing = points.filter((p) => p.latitude == null || p.longitude == null);
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing coordinates for: ${missing
        .map((p) => p.name?.trim() || p.id)
        .join(", ")}. Set coordinates for those addresses first (employee
        profile lat/lng or the Pick-up Points page).`,
    };
  }

  const coords = points.map((p) => ({
    latitude: p.latitude!,
    longitude: p.longitude!,
    key: p.key ?? null,
  }));
  const officeCoords = { latitude: office.lat, longitude: office.lng };
  const officeName = office.name;

  const first = normalizeTime(anchor.firstPickupTime);
  const base = normalizeTime(anchor.baseETA) ?? normalizeTime(anchor.defaultArrival);
  const minutes: number[] = new Array(points.length);
  let method: "first_pickup" | "base_eta";
  let officeArrival: string;

  if (first) {
    method = "first_pickup";
    const [h, m] = first.split(":").map(Number);
    minutes[0] = snapPickupMinutesUp(h * 60 + m);
    for (let i = 1; i < points.length; i++) {
      minutes[i] = snapPickupMinutesUp(
        minutes[i - 1] + driveLegMinutes(coords[i - 1], coords[i], learned, officeName)
      );
    }
    officeArrival = minutesToTimeString(
      snapPickupMinutesUp(
        minutes[points.length - 1] +
          driveLegMinutes(coords[coords.length - 1], officeCoords, learned, officeName)
      )
    );
  } else if (base) {
    method = "base_eta";
    const [h, m] = base.split(":").map(Number);
    const anchorMinutes = h * 60 + m;
    const back = new Array<number>(points.length);
    back[points.length - 1] =
      anchorMinutes -
      driveLegMinutes(coords[coords.length - 1], officeCoords, learned, officeName);
    for (let i = points.length - 2; i >= 0; i--) {
      back[i] =
        back[i + 1] -
        driveLegMinutes(coords[i], coords[i + 1], learned, officeName);
    }
    if (back[0] < 0) {
      return {
        success: false,
        error:
          "Pickup drive time exceeds the arrival window — set an earlier first pickup time or a later BASE ETA.",
      };
    }
    for (let i = 0; i < points.length; i++) {
      minutes[i] = snapPickupMinutesDown(back[i]);
    }
    // Enforce >= 5 min between consecutive pickups (snapping can collapse a
    // sub-grid drive leg to a 0-min gap); the last pickup is already >= 5 min
    // before the anchor because the anchor sits on the 5-minute grid.
    for (let i = points.length - 2; i >= 0; i--) {
      if (minutes[i] > minutes[i + 1] - PICKUP_GRID_MINUTES) {
        minutes[i] = snapPickupMinutesDown(
          minutes[i + 1] - PICKUP_GRID_MINUTES
        );
      }
    }
    officeArrival = base;
  } else {
    return {
      success: false,
      error: "Set a vehicle first pickup time or BASE ETA before scheduling.",
    };
  }

  return {
    success: true,
    method,
    officeArrival,
    points: points.map((p, i) => ({
      id: p.id,
      pickup: minutesToTimeString(minutes[i]),
    })),
  };
}

/**
 * Load the learned per-leg medians for one shift ("10PM" | "11PM" | "12AM-6AM").
 *
 * BRIDGED KEYS: the manual-plan teacher binds legs to the employee's pickup
 * address (`pickupAddressId ?? homeAddressId`), while route generation runs on
 * the resolved HOME address. When an employee has both, the same physical stop
 * is two different `addr:<id>` keys — so every learned leg is also indexed
 * under the employee's other address (both directions), letting a leg taught
 * as `addr:pickup → addr:X` be found when the planner asks for
 * `addr:home → addr:X`.
 */
export async function loadLearnedLegs(shiftKey: string): Promise<LearnedResolver> {
  const rows = await prisma.routeLegLearning.findMany({ where: { shiftKey } });
  const map: LearnedResolver = new Map();
  for (const row of rows) {
    map.set(`${row.fromKey}->${row.toKey}`, {
      avgMinutes: row.avgMinutes,
      sampleCount: row.sampleCount,
      min: row.minMinutes,
      max: row.maxMinutes,
    });
  }

  const pairs = await prisma.user.findMany({
    where: { homeAddressId: { not: null }, pickupAddressId: { not: null } },
    select: { homeAddressId: true, pickupAddressId: true },
  });
  const alias = new Map<string, string>();
  for (const pair of pairs) {
    if (!pair.homeAddressId || !pair.pickupAddressId) continue;
    if (pair.homeAddressId === pair.pickupAddressId) continue;
    alias.set(`addr:${pair.pickupAddressId}`, `addr:${pair.homeAddressId}`);
    alias.set(`addr:${pair.homeAddressId}`, `addr:${pair.pickupAddressId}`);
  }
  if (alias.size > 0) {
    const bridged: Array<[string, LearnedLeg]> = [];
    for (const [key, leg] of map) {
      if (!key.startsWith("addr:")) continue;
      const [from, to] = key.split("->");
      const fromAlias = alias.get(from);
      const toAlias = alias.get(to);
      if (fromAlias && !map.has(`${fromAlias}->${to}`)) {
        bridged.push([`${fromAlias}->${to}`, leg]);
      }
      if (toAlias && !map.has(`${from}->${toAlias}`)) {
        bridged.push([`${from}->${toAlias}`, leg]);
      }
      if (fromAlias && toAlias && !map.has(`${fromAlias}->${toAlias}`)) {
        bridged.push([`${fromAlias}->${toAlias}`, leg]);
      }
    }
    for (const [key, leg] of bridged) map.set(key, leg);
  }

  return map;
}

/**
 * Recompute and persist every active pickup point's `baseETA` for a vehicle
 * from its first pickup time (forward) or BASE ETA (backward), using the
 * 5 min/km rule and the learned 10 PM set. Best-effort: never throws.
 */
export async function syncPickupPointTimes(
  vehicleId: string
): Promise<PickupScheduleResult> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId },
    include: {
      pickupSequence: {
        where: { isActive: true },
        orderBy: { sequence: "asc" },
        include: { address: true },
      },
    },
  });
  if (!vehicle) return { success: false, error: "Vehicle not found." };

  const learned = await loadLearnedLegs("10PM");
  const points: SchedulePointInput[] = vehicle.pickupSequence.map((p) => ({
    id: p.id,
    name: p.name,
    latitude: p.address?.latitude ?? null,
    longitude: p.address?.longitude ?? null,
    key: p.addressId ? `addr:${p.addressId}` : null,
  }));

  const office = officeCoordinatesFor(vehicle.officeLocation ?? "Regnum");
  const result = computePickupSchedule(
    {
      firstPickupTime: vehicle.firstPickupTime,
      baseETA: vehicle.baseETA,
      // Preset points are the 10 PM trips, whose office arrival is 22:00.
      // When the vehicle has no manual anchor, load-learnt / taught gaps
      // back-calculate the pickup times from here — no manual entry needed.
      defaultArrival: "22:00",
    },
    points,
    office,
    learned
  );
  if (!result.success) return result;

  await prisma.$transaction(
    result.points.map((u) =>
      prisma.pickupPoint.update({
        where: { id: u.id },
        data: { baseETA: u.pickup },
      })
    )
  );

  return result;
}