"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { LEARN_MIN_SAMPLES } from "@/lib/routing/pickup-schedule";
import { legObservationsFromManualEntries } from "@/lib/routing/manual-plan-training";

/**
 * "Skill-up" data mining.
 *
 * `trainRoutePlannerFromHistory` scans every historical RoutePlan and derives,
 * per ordered stop pair, the actual elapsed pickup-pickup (and office->first /
 * last->office) gap — the real signal Facilities tuned day after day. The
 * per-leg medians are stored in `RouteLegLearning` and the scheduler prefers
 * them (once a leg has >= LEARN_MIN_SAMPLES observations) over the generic
 * 5 min/km distance estimate.
 *
 * Runs automatically at the start of every RUN MAPPING (generateWeeklyRoutes
 * calls this before generating), so Facilities never has to click "Learn from
 * history" manually. It is idempotent — a run fully replaces the learned set
 * from the current history.
 */

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
  return d.getHours() * 60 + d.getMinutes();
}

/** Map a RoutePlan arrival label to its minutes-from-midnight. */
function arrivalMinutesFromLabel(arrivalTime: string): number | null {
  const normalized = (arrivalTime || "").toUpperCase().replace(/\s+/g, "");
  const map: Record<string, number> = {
    "10PM": 22 * 60,
    "11PM": 23 * 60,
    "12AM": 24 * 60,
    "1AM": 25 * 60,
    "2AM": 26 * 60,
    "3AM": 27 * 60,
    "4AM": 28 * 60,
    "5AM": 29 * 60,
    "6AM": 30 * 60,
  };
  return map[normalized] ?? null;
}

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
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const plans = await prisma.routePlan.findMany({
      include: {
        tripAssignments: {
          include: {
            employee: true,
            pickupAddress: true,
            pickupPoint: { include: { address: true } },
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
      const arrival = arrivalMinutesFromLabel(plan.arrivalTime);

      // office -> first pickup (from departureTime when recorded)
      const dep = dateMinutes(plan.departureTime);
      const first = hhmmToMinutes(stops[0].pickupTime);
      if (dep !== null && first !== null) {
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
    const manualEntries = await prisma.manualRoutePlanEntry.findMany();
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

    await prisma.routeLegLearning.deleteMany({});
    if (rows.length > 0) {
      await prisma.routeLegLearning.createMany({ data: rows });
    }

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
      error:
        error instanceof Error ? error.message : String(error),
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
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
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
        `A leg is TRUSTED once it has ≥ ${LEARN_MIN_SAMPLES} observations — trusted legs replace the 5 min/km estimate when planning pick-up times.`,
        "Pick-up times are back-calculated from the shift arrival along each leg: trusted gap first, otherwise straight-line distance × 5 min/km, snapped to the 5-minute grid with ≥ 5 minutes between stops.",
        "Teach from manual plan stores your hand-made gaps; every RUN MAPPING re-merges them, so they survive automatic retrains.",
        "Employees with both a pickup and a home address share the same learned leg across both address keys (bridged), so a leg taught from your plan is found whichever address the route uses.",
        `One full week (5–6 days) of the same repeating run per vehicle brings every leg in it to trusted — that is the recommended amount of reference data.`,
      ],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}