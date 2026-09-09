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