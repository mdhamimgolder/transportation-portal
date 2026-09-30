/**
 * Single source of truth for a vehicle's pickup-point schedule times.
 *
 * Drive rule ("trained-data rule"):
 *  - a leg's drive time is ALWAYS a learned average gap for that exact leg
 *    (see the RouteLegLearning table), trusted once it has >= LEARN_MIN_SAMPLES
 *    observations mined from FINALIZED routes and "Teach from manual plan"
 *    uploads. There is NO distance estimate fallback — if a leg was never
 *    finalized or taught, the schedule errors instead of inventing a time.
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
import { minutesToTimeString } from "./utils";
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

export type VehiclePointSchedule = {
  vehicleId: string;
  vehicleNumber: string | null;
  officeLocation: string;
  /** Derived office arrival ("HH:mm") that follows the LAST pickup time. */
  officeArrival: string;
  method: "first_pickup" | "base_eta";
  /** pickupPointId → "HH:mm". The point's ONE pickup time, every day / week. */
  times: Map<string, string>;
  /** The vehicle's active points, in configured (preset) sequence order. */
  points: Array<{
    id: string;
    sequence: number;
    addressId: string;
    name: string;
  }>;
  /** True when the persisted point times had to be (re)computed on this call. */
  recomputed: boolean;
};

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
 * Drive minutes for one leg — TRAINED DATA ONLY. Returns the learned average
 * (>= LEARN_MIN_SAMPLES samples) when the resolver knows the pair, otherwise
 * `null`. The 5 min/km distance estimate was removed so pickup times can never
 * be invented from coordinates; callers must error when a leg resolves to
 * `null`.
 */
export function driveLegMinutes(
  a: { latitude: number; longitude: number; key?: string | null },
  b: { latitude: number; longitude: number; key?: string | null },
  learned?: LearnedResolver,
  officeName?: string
): number | null {
  const aKey = a.key ?? (officeName ? `office:${officeName}` : null);
  const bKey = b.key ?? (officeName ? `office:${officeName}` : null);
  const leg = legKey(aKey, bKey);
  if (!leg) return null;
  const learnedMinutes = learned?.get(leg);
  if (learnedMinutes && learnedMinutes.sampleCount >= LEARN_MIN_SAMPLES) {
    return Math.max(1, Math.round(learnedMinutes.avgMinutes));
  }
  return null;
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

  // Trained-data rule (no estimate fallback): every leg of the pickup schedule
  // — each consecutive point pair and the last point -> office — must resolve
  // to a learned drive time (>= LEARN_MIN_SAMPLES observations from finalized
  // routes / taught manual plans). Otherwise we refuse to fabricate a picking
  // time and list the missing legs instead.
  const label = (p: SchedulePointInput) => p.name?.trim() || p.id;
  const legMinutes: Array<number | null> = [];
  for (let i = 0; i < points.length; i++) {
    const isOfficeLeg = i === points.length - 1;
    legMinutes.push(
      driveLegMinutes(
        coords[i],
        isOfficeLeg ? officeCoords : coords[i + 1],
        learned,
        officeName
      )
    );
  }
  const untrained = points.flatMap((_, i) =>
    legMinutes[i] == null
      ? [
          `${label(points[i])} → ${
            i === points.length - 1 ? officeName : label(points[i + 1])
          }`,
        ]
      : []
  );
  if (untrained.length > 0) {
    return {
      success: false,
      error:
        `No finalized/taught drive time yet for: ${untrained.join(", ")}. ` +
        `Pickup times come from trained gaps only — finalize this route or use ` +
        `"Teach from manual plan" (needing ≥ ${LEARN_MIN_SAMPLES} observations ` +
        `per leg); the 5 min/km estimate was removed.`,
    };
  }
  const legMins = legMinutes as number[];

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
      minutes[i] = snapPickupMinutesUp(minutes[i - 1] + legMins[i - 1]);
    }
    officeArrival = minutesToTimeString(snapPickupMinutesUp(minutes[points.length - 1] + legMins[points.length - 1]));
  } else if (base) {
    method = "base_eta";
    const [h, m] = base.split(":").map(Number);
    const anchorMinutes = h * 60 + m;
    const back = new Array<number>(points.length);
    back[points.length - 1] = anchorMinutes - legMins[points.length - 1];
    for (let i = points.length - 2; i >= 0; i--) {
      back[i] = back[i + 1] - legMins[i];
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
 * from its first pickup time (forward) or BASE ETA (backward), using trained
 * legs only (finalized routes / taught manual plans) and the 10 PM learned
 * set. Best-effort: never throws.
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

/** "HH:mm" → minutes since midnight (null when unparsable). */
function timeToMinutes(raw: string | null | undefined): number | null {
  const normalized = normalizeTime(raw);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

/**
 * THE canonical pickup-point schedule of one vehicle: `PickupPoint.baseETA` is
 * the source of truth, so a point keeps ONE pickup time — Sankar at 20:55 is
 * 20:55 on Monday AND Friday, this week AND the next.
 *
 * The schedule is recomputed + persisted ONLY when the stored values can't be
 * trusted (missing, unparsable, missing coordinates, or no longer increasing
 * with the configured point sequence — which is what a sequence change without
 * a sync looks like). Consumers therefore never re-derive times per day from
 * whatever the learned legs happen to hold at that moment — that feedback loop
 * was what made the same point drift 21:10 → 21:05 → 21:00 across a week.
 *
 * Every consumer reads its times from here: the 10 PM generator, the
 * drag/reorder re-timer, the planner diagnostics and the repair scripts.
 */
export async function ensurePickupPointSchedule(
  vehicleId: string,
  shiftKey = "10PM"
): Promise<
  { success: true; schedule: VehiclePointSchedule } | { success: false; error: string }
> {
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

  const points = vehicle.pickupSequence;
  if (points.length === 0) {
    return { success: false, error: "Vehicle has no pickup points." };
  }

  const officeName = vehicle.officeLocation ?? "Regnum";
  const office = officeCoordinatesFor(officeName);
  const officeCoords = {
    latitude: office.lat,
    longitude: office.lng,
    key: `office:${officeName}`,
  };
  const learned = await loadLearnedLegs(shiftKey);
  const anchor: PickupAnchor = {
    firstPickupTime: vehicle.firstPickupTime,
    baseETA: vehicle.baseETA,
    // Preset points are the 10 PM trips, whose office arrival is 22:00.
    defaultArrival: shiftKey === "10PM" ? "22:00" : null,
  };

  const pointRefs = points.map((p) => ({
    id: p.id,
    sequence: p.sequence,
    addressId: p.addressId,
    name: p.name,
  }));

  const storedMinutes = points.map((p) => timeToMinutes(p.baseETA));
  const hasCoords = points.every(
    (p) => p.address?.latitude != null && p.address?.longitude != null
  );
  // Usable = every point has a parsed time AND the times still increase with
  // the configured sequence (equal times are impossible between distinct
  // points on the 5-minute grid, so a repeat means the rows are stale).
  const usable =
    hasCoords &&
    storedMinutes.every((m) => m != null) &&
    storedMinutes.every(
      (m, i) => i === 0 || (m as number) > (storedMinutes[i - 1] as number)
    );

  if (usable) {
    const last = points[points.length - 1];
    const lastToOffice = driveLegMinutes(
      {
        latitude: last.address!.latitude!,
        longitude: last.address!.longitude!,
        key: `addr:${last.addressId}`,
      },
      officeCoords,
      learned,
      officeName
    );

    if (lastToOffice != null) {
      const times = new Map<string, string>();
      points.forEach((p, i) => times.set(p.id, minutesToTimeString(storedMinutes[i] as number)));

      const officeArrival = minutesToTimeString(
        snapPickupMinutesUp(
          (storedMinutes[storedMinutes.length - 1] as number) + lastToOffice
        )
      );

      return {
        success: true,
        schedule: {
          vehicleId,
          vehicleNumber: vehicle.vehicleNumber,
          officeLocation: officeName,
          officeArrival,
          method: normalizeTime(anchor.firstPickupTime) ? "first_pickup" : "base_eta",
          times,
          points: pointRefs,
          recomputed: false,
        },
      };
    }
    // Last -> office leg has no finalized/taught drive time — fall through to
    // recompute, which validates every leg against the trained set and reports
    // exactly which legs are missing.
  }

  // Stored schedule is missing / stale → recompute it once from the vehicle's
  // anchor (first pickup time, else BASE ETA, else the shift's office arrival)
  // and persist it, so every day of every week reads the same values.
  const result = computePickupSchedule(
    anchor,
    points.map((p) => ({
      id: p.id,
      name: p.name,
      latitude: p.address?.latitude ?? null,
      longitude: p.address?.longitude ?? null,
      key: p.addressId ? `addr:${p.addressId}` : null,
    })),
    office,
    learned
  );
  if (!result.success) return { success: false, error: result.error };

  await prisma
    .$transaction(
      result.points.map((u) =>
        prisma.pickupPoint.update({
          where: { id: u.id },
          data: { baseETA: u.pickup },
        })
      )
    )
    .catch(() => undefined);

  return {
    success: true,
    schedule: {
      vehicleId,
      vehicleNumber: vehicle.vehicleNumber,
      officeLocation: officeName,
      officeArrival: result.officeArrival,
      method: result.method,
      times: new Map(result.points.map((u) => [u.id, u.pickup])),
      points: pointRefs,
      recomputed: true,
    },
  };
}