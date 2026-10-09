"use server";

import { revalidatePath } from "next/cache";
import { dhakaMinutesOfDay } from "@/lib/date/week";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { arrivalMinutesForLabel } from "@/lib/constants/route-shifts";
import { LEARN_MIN_SAMPLES, invalidateLearnedLegs } from "@/lib/routing/pickup-schedule";
import { legObservationsFromManualEntries } from "@/lib/routing/manual-plan-training";
import {
  sanitizedActionError,
  sanitizedActionMessage,
  throwSanitizedError,
} from "@/lib/actions/action-error";

/**
 * "Skill-up" data mining.
 *
 * `trainRoutePlannerFromHistory` scans every FINALIZED/EXECUTED RoutePlan and derives,
 * per ordered stop pair, the actual elapsed pickup-pickup (and office->first /
 * last->office) gap — the real signal Facilities tuned day after day. The
 * per-leg medians are stored in `RouteLegLearning`. The scheduler REQUIRES a
 * leg to be trained (>= LEARN_MIN_SAMPLES observations) before it will assign
 * a pick-up time for that leg — the old 5 min/km distance estimate was removed,
 * so an untrained leg errors instead of being estimated.
 *
 * Runs automatically at the start of every RUN MAPPING (generateWeeklyRoutes
 * calls this before generating), so Facilities never has to click "Learn from
 * history" manually. It is idempotent — a run fully replaces the learned set
 * from the current history.
 */

/** Plans whose pickup times are human-confirmed ground truth. */
const LEARNABLE_PLAN_STATUSES = ["FINALIZED", "EXECUTED"];

type LegAgg = {
  fromKey: string;
  toKey: string;
  fromLabel: string;
  toLabel: string;
  shiftKey: string;
  count: number;
  sum: number;
  min: number;
  max: number;
};

function hhmmToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function dateMinutes(d: Date | null | undefined): number | null {
  if (!d) return null;
  return dhakaMinutesOfDay(d);
}

// Arrival-label → minutes lives in lib/constants/route-shifts.ts
// (arrivalMinutesForLabel); do not add another copy here.

function shiftKeyForLabel(label: string): string {
  const normalized = (label || "").toUpperCase().replace(/\s+/g, "");
  if (normalized === "10PM") return "10PM";
  if (normalized === "11PM") return "11PM";
  return "12AM-6AM";
}

type StopShape = {
  pickupTime: string | null;
  pickupType: string;
  pickupPointId: string | null;
  pickupPoint: { name: string | null; addressId: string | null } | null;
  pickupAddressId: string | null;
  pickupAddress: { addressText: string } | null;
  employee: { address: string | null };
};

function stopKey(stop: StopShape): string | null {
  const addressId =
    stop.pickupType === "PRESET_POINT"
      ? stop.pickupPoint?.addressId ?? null
      : stop.pickupAddressId ?? stop.pickupPoint?.addressId ?? null;
  return addressId ? `addr:${addressId}` : null;
}

function stopLabel(stop: StopShape): string {
  const presetName = stop.pickupPoint?.name?.trim();
  if (presetName) return presetName;
  return (
    stop.pickupAddress?.addressText?.trim() ||
    stop.employee.address?.trim() ||
    "home"
  );
}

export type LearnFromHistoryResult = {
  success: boolean;
  error?: string;
  legCount: number;
  observationCount: number;
  confidentLegs: number;
  perShift: Record<string, { legs: number; observations: number }>;
};

/** Scan all historical route plans and rebuild the learned pickup-leg set. */
export async function trainRoutePlannerFromHistory(): Promise<LearnFromHistoryResult> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    // Learn ONLY from routes Facilities signed off (plus manual-plan rows
    // below). DRAFT plans are the planner's own output — mining them fed the
    // generator its previous guesses back as "observed" drive times.
    // `select` keeps this to the few columns the aggregation reads (the full
    // history otherwise drags every rider row + routeAnalysis JSON along).
    const plans = await prisma.routePlan.findMany({
      where: { status: { in: LEARNABLE_PLAN_STATUSES } },
      select: {
        arrivalTime: true,
        routeType: true,
        officeLocation: true,
        departureTime: true,
        tripAssignments: {
          select: {
            sequenceInTrip: true,
            pickupTime: true,
            pickupType: true,
            pickupPointId: true,
            pickupAddressId: true,
            pickupPoint: { select: { name: true, addressId: true } },
            pickupAddress: { select: { addressText: true } },
            employee: { select: { address: true } },
          },
        },
      },
    });

    const aggByKey = new Map<string, LegAgg>();

    const record = (
      fromKey: string | null,
      fromLabel: string,
      toKey: string | null,
      toLabel: string,
      gap: number,
      shiftKey: string
    ) => {
      if (!fromKey || !toKey) return;
      if (!(Number.isFinite(gap) && gap >= 1 && gap <= 240)) return;
      const key = `${fromKey}->${toKey}|${shiftKey}`;
      const existing = aggByKey.get(key);
      if (existing) {
        existing.count += 1;
        existing.sum += gap;
        existing.min = Math.min(existing.min, gap);
        existing.max = Math.max(existing.max, gap);
      } else {
        aggByKey.set(key, {
          fromKey,
          toKey,
          fromLabel,
          toLabel,
          shiftKey,
          count: 1,
          sum: gap,
          min: gap,
          max: gap,
        });
      }
    };

    for (const plan of plans) {
      const stops = plan.tripAssignments
        .filter((t) => t.sequenceInTrip > 0)
        .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip);
      if (stops.length === 0) continue;

      const shiftKey = shiftKeyForLabel(plan.arrivalTime);
      const officeName = plan.officeLocation?.trim() || "Regnum";
      const officeKey = `office:${officeName}`;
      const arrival = arrivalMinutesForLabel(plan.arrivalTime);

      // PRESET_10PM stores 20:00 as a placeholder, not an observed departure.
      // Learning this as a real leg would poison the office-to-first-stop data.
      const dep = dateMinutes(plan.departureTime);
      const first = hhmmToMinutes(stops[0].pickupTime);
      if (plan.routeType !== "PRESET_10PM" && dep !== null && first !== null) {
        record(officeKey, officeName, stopKey(stops[0]), stopLabel(stops[0]), (first - dep + 1440) % 1440, shiftKey);
      }

      // consecutive stops
      for (let i = 0; i < stops.length - 1; i++) {
        const a = hhmmToMinutes(stops[i].pickupTime);
        const b = hhmmToMinutes(stops[i + 1].pickupTime);
        if (a !== null && b !== null) {
          record(stopKey(stops[i]), stopLabel(stops[i]), stopKey(stops[i + 1]), stopLabel(stops[i + 1]), (b - a + 1440) % 1440, shiftKey);
        }
      }

      // last pickup -> office
      if (arrival !== null) {
        const last = hhmmToMinutes(stops[stops.length - 1].pickupTime);
        if (last !== null) {
          record(stopKey(stops[stops.length - 1]), stopLabel(stops[stops.length - 1]), officeKey, officeName, (arrival - last + 1440) % 1440, shiftKey);
        }
      }
    }

    // ── Manual-plan knowledge ("Teach from manual plan" CSV rows) ──────
    // Ground-truth rows Facilities uploaded by hand are merged into the same
    // aggregate so a retrain never wipes the hand-tuned leg times.
    const manualEntries = await prisma.manualRoutePlanEntry.findMany({
      select: {
        id: true,
        date: true,
        shiftKey: true,
        vehicleNumber: true,
        addressId: true,
        pickupLabel: true,
        pickupMinutes: true,
        orderIndex: true,
        officeLabel: true,
        arrivalMinutes: true,
      },
    });
    const manual = legObservationsFromManualEntries(
      manualEntries.map((e) => ({
        id: e.id,
        date: e.date,
        shiftKey: e.shiftKey,
        vehicleNumber: e.vehicleNumber,
        addressId: e.addressId,
        pickupLabel: e.pickupLabel,
        pickupMinutes: e.pickupMinutes,
        orderIndex: e.orderIndex,
        officeLabel: e.officeLabel,
        arrivalMinutes: e.arrivalMinutes,
      }))
    );
    for (const obs of manual.observations) {
      record(obs.fromKey, obs.fromLabel, obs.toKey, obs.toLabel, obs.gapMinutes, obs.shiftKey);
    }

    const rows = Array.from(aggByKey.values()).map((agg) => ({
      fromKey: agg.fromKey,
      toKey: agg.toKey,
      fromLabel: agg.fromLabel.slice(0, 120),
      toLabel: agg.toLabel.slice(0, 120),
      shiftKey: agg.shiftKey,
      sampleCount: agg.count,
      avgMinutes: agg.sum / agg.count,
      minMinutes: agg.min,
      maxMinutes: agg.max,
    }));

    // Atomic swap: a concurrent RUN MAPPING must never observe the table
    // empty between the delete and the insert (every leg would read as
    // untrained and every route would error).
    await prisma.$transaction([
      prisma.routeLegLearning.deleteMany({}),
      ...(rows.length > 0 ? [prisma.routeLegLearning.createMany({ data: rows })] : []),
    ]);
    invalidateLearnedLegs();

    const perShift: Record<string, { legs: number; observations: number }> = {};
    const confidentLegs = rows.filter((r) => r.sampleCount >= LEARN_MIN_SAMPLES).length;
    for (const row of rows) {
      const entry = (perShift[row.shiftKey] ??= { legs: 0, observations: 0 });
      entry.legs += 1;
      entry.observations += row.sampleCount;
    }

    revalidatePath("/facilities/automated-route-planner");

    return {
      success: true,
      legCount: rows.length,
      observationCount: rows.reduce((sum, r) => sum + r.sampleCount, 0),
      confidentLegs,
      perShift,
    };
  } catch (error) {
    return {
      success: false,
      error: sanitizedActionMessage("trainRoutePlannerFromHistory", error),
      legCount: 0,
      observationCount: 0,
      confidentLegs: 0,
      perShift: {},
    };
  }
}

export type RouteLearningStats = {
  legCount: number;
  observationCount: number;
  confidentLegs: number;
  lastTrainedAt: string | null;
  /** Rows ingested from manually made route plans ("Teach from manual plan"). */
  manualEntryCount: number;
  sample: Array<{
    from: string | null;
    to: string | null;
    avgMinutes: number;
    sampleCount: number;
    shiftKey: string;
  }>;
};

/** Current learned-set summary for the auto route planner UI. */
export async function getRouteLearningStats(): Promise<RouteLearningStats> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const [all, manualEntryCount] = await Promise.all([
      prisma.routeLegLearning.findMany({
        orderBy: [{ sampleCount: "desc" }, { avgMinutes: "asc" }],
      }),
      prisma.manualRoutePlanEntry.count(),
    ]);
    let lastTrainedAt: string | null = null;
    for (const row of all) {
      const ts = row.updatedAt.getTime();
      if (!lastTrainedAt || ts > new Date(lastTrainedAt).getTime()) {
        lastTrainedAt = row.updatedAt.toISOString();
      }
    }
    return {
      legCount: all.length,
      observationCount: all.reduce((sum, r) => sum + r.sampleCount, 0),
      confidentLegs: all.filter((r) => r.sampleCount >= LEARN_MIN_SAMPLES).length,
      lastTrainedAt,
      manualEntryCount,
      sample: all.slice(0, 8).map((r) => ({
        from: r.fromLabel,
        to: r.toLabel,
        avgMinutes: r.avgMinutes,
        sampleCount: r.sampleCount,
        shiftKey: r.shiftKey,
      })),
    };
  } catch (error) {
    throwSanitizedError("getRouteLearningStats", error);
  }
}

export type RouteLegDiagnostic = {
  shiftKey: string;
  from: string | null;
  to: string | null;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  sampleCount: number;
  trusted: boolean;
};

export type RouteMemoryDiagnostic =
  | {
      success: true;
      trusted: number;
      untrusted: number;
      totalObservations: number;
      manualEntryCount: number;
      minSamplesRequired: number;
      /** Employees whose pickup and home address share learned legs (bridged keys). */
      bridgedEmployees: number;
      legs: RouteLegDiagnostic[];
      notes: string[];
    }
  | { success: false; error: string };

/**
 * "Why these pick-up times?" — the full route-memory table: every learned leg,
 * trusted or not, with its observations and the rules the planner applies.
 */
export async function getRouteMemoryDiagnostic(): Promise<RouteMemoryDiagnostic> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const [legs, manualEntryCount] = await Promise.all([
      prisma.routeLegLearning.findMany({
        orderBy: [
          { shiftKey: "asc" },
          { sampleCount: "desc" },
          { avgMinutes: "asc" },
        ],
      }),
      prisma.manualRoutePlanEntry.count(),
    ]);
    const pairs = await prisma.user.findMany({
      where: { homeAddressId: { not: null }, pickupAddressId: { not: null } },
      select: { homeAddressId: true, pickupAddressId: true },
    });
    const bridgedEmployees = pairs.filter(
      (p) => p.homeAddressId && p.pickupAddressId && p.homeAddressId !== p.pickupAddressId
    ).length;
    const trusted = legs.filter((r) => r.sampleCount >= LEARN_MIN_SAMPLES).length;
    return {
      success: true,
      trusted,
      untrusted: legs.length - trusted,
      totalObservations: legs.reduce((sum, r) => sum + r.sampleCount, 0),
      manualEntryCount,
      minSamplesRequired: LEARN_MIN_SAMPLES,
      bridgedEmployees,
      legs: legs.map((r) => ({
        shiftKey: r.shiftKey,
        from: r.fromLabel,
        to: r.toLabel,
        avgMinutes: r.avgMinutes,
        minMinutes: r.minMinutes,
        maxMinutes: r.maxMinutes,
        sampleCount: r.sampleCount,
        trusted: r.sampleCount >= LEARN_MIN_SAMPLES,
      })),
      notes: [
        `A leg is TRUSTED once it has ≥ ${LEARN_MIN_SAMPLES} observations — pick-up times come from TRUSTED (finalized/taught) legs only; a leg without enough observations errors the route instead of being estimated.`,
        "Pick-up times are back-calculated from the shift arrival along each leg (trusted gap only — no distance estimate), snapped to the 5-minute grid with ≥ 5 minutes between stops.",
        "Teach from manual plan stores your hand-made gaps; every RUN MAPPING re-merges them, so they survive automatic retrains.",
        "Employees with both a pickup and a home address share the same learned leg across both address keys (bridged), so a leg taught from your plan is found whichever address the route uses.",
        `One full week (5–6 days) of the same repeating run per vehicle brings every leg in it to trusted — that is the recommended amount of reference data.`,
      ],
    };
  } catch (error) {
    return {
      success: false,
      ...sanitizedActionError("getRouteMemoryDiagnostic", error),
    };
  }
}