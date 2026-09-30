import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { ensurePickupPointSchedule } from "@/lib/routing/pickup-schedule";

/**
 * REPAIR #4 — ONE pickup time per pickup point for the whole week.
 *
 * A pickup point's time is canonical (`PickupPoint.baseETA`, resolved through
 * `ensurePickupPointSchedule`), so "Sankar = 20:55" is 20:55 on Monday AND
 * Friday. This pass applies that single schedule to every PRESET_10PM plan of
 * the live week and re-sequences each plan to the vehicle's point sequence so
 * the pickup column can never decrease. Audited as PRESET_WEEK_SCHEDULE_SYNC.
 *
 * EXECUTED plans are untouched; FINALIZED days are reported only (riders were
 * already notified for those days).
 */

const WEEK_START = new Date(Date.UTC(2026, 8, 21)); // Mon 21 Sep 2026, UTC midnight

/**
 * `true` also re-syncs FINALIZED days (riders get re-notified: emailSentAt is
 * reset). EXECUTED routes are history and are never touched. Flip to `false` to
 * report-only on locked days.
 */
const INCLUDE_LOCKED = true;

type VehicleSchedule = Awaited<ReturnType<typeof ensurePickupPointSchedule>>;

async function main() {
  const plans = await prisma.routePlan.findMany({
    where: { weekStartDate: WEEK_START, routeType: "PRESET_10PM" },
    include: {
      vehicle: { select: { vehicleNumber: true } },
      tripAssignments: {
        include: {
          employee: { select: { fullName: true } },
          pickupPoint: true,
        },
      },
    },
    orderBy: [{ dayDate: "asc" }],
  });

  // vehicleId → resolved canonical schedule (computed once per vehicle).
  const scheduleCache = new Map<string, VehicleSchedule>();
  const loadSchedule = async (vehicleId: string): Promise<VehicleSchedule> => {
    const cached = scheduleCache.get(vehicleId);
    if (cached) return cached;
    const result = await ensurePickupPointSchedule(vehicleId);
    scheduleCache.set(vehicleId, result);
    if (result.success) {
      console.log(
        `📅 ${result.schedule.vehicleNumber ?? vehicleId} week schedule` +
          (result.schedule.recomputed ? " (recomputed)" : "") +
          ": " +
          result.schedule.points
            .map((p) => `${p.name}=${result.schedule.times.get(p.id)}`)
            .join(", ")
      );
    } else {
      console.log(`⚠️ ${vehicleId}: no canonical schedule — ${result.error}`);
    }
    return result;
  };

  const changedPlans = new Set<string>();
  let changedTrips = 0;
  let lockedPlans = 0;

  for (const plan of plans) {
    const schedule = await loadSchedule(plan.vehicleId);
    if (!schedule.success) continue;

    const { points, times } = schedule.schedule;
    const resolvePointId = (
      t: (typeof plan.tripAssignments)[number]
    ): string | null => {
      if (t.pickupType !== "PRESET_POINT" || !t.pickupPoint) return null;
      const p = t.pickupPoint;
      if (points.some((vp) => vp.id === p.id)) return p.id;
      const byAddress = points.find((vp) => vp.addressId === p.addressId);
      if (byAddress) return byAddress.id;
      const name = p.name?.trim().toLowerCase();
      if (name) {
        const byName = points.find((vp) => vp.name.trim().toLowerCase() === name);
        if (byName) return byName.id;
      }
      return null;
    };
    // Order the rows by the vehicle's point sequence (stable: same-point riders
    // keep their relative order; riders with no point on this vehicle stay last)
    // so the canonical times below can only increase down the column.
    const ordered = plan.tripAssignments
      .slice()
      .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip)
      .map((t) => {
        const pointId = resolvePointId(t);
        return {
          trip: t,
          seq: pointId ? times.get(pointId) : undefined,
          pointOrder: pointId
            ? points.find((p) => p.id === pointId)!.sequence
            : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.pointOrder - b.pointOrder);

    let cursor: string | null = ordered.find((o) => o.seq != null)?.seq ?? null;

    const updates: Array<{
      tripId: string;
      employee: string;
      sequenceInTrip: number;
      beforeTime: string | null;
      afterTime: string;
      beforeSeq: number;
    }> = [];

    ordered.forEach((entry, i) => {
      if (entry.seq) cursor = entry.seq;
      const newTime = cursor;
      if (!newTime) return;
      const timeChanged = entry.trip.pickupTime !== newTime;
      const seqChanged = entry.trip.sequenceInTrip !== i + 1;
      if (timeChanged || seqChanged) {
        updates.push({
          tripId: entry.trip.id,
          employee: entry.trip.employee.fullName,
          sequenceInTrip: i + 1,
          beforeTime: entry.trip.pickupTime,
          afterTime: newTime,
          beforeSeq: entry.trip.sequenceInTrip,
        });
      }
    });

    if (updates.length === 0) continue;

    const label = `${plan.vehicle.vehicleNumber} ${plan.dayDate
      .toISOString()
      .slice(0, 10)} [${plan.status}/${plan.arrivalTime}]`;

    if (
      !INCLUDE_LOCKED &&
      (plan.status === "FINALIZED" || plan.status === "EXECUTED")
    ) {
      lockedPlans++;
      console.log(`🔒 ${label} needs ${updates.length} fix(es) — reported only:`);
      for (const u of updates) {
        console.log(
          `    ${u.employee}: ${u.beforeTime} → ${u.afterTime}${
            u.beforeSeq !== u.sequenceInTrip
              ? ` (row ${u.beforeSeq} → ${u.sequenceInTrip})`
              : ""
          }`
        );
      }
      continue;
    }
    if (plan.status === "EXECUTED") {
      lockedPlans++;
      console.log(`⏭️ ${label} is EXECUTED (history) — left untouched.`);
      continue;
    }

    changedTrips += updates.length;
    changedPlans.add(plan.id);
    console.log(`✏️ ${label}: ${updates.length} row(s)`);
    for (const u of updates) {
      console.log(
        `    ${u.employee}: ${u.beforeTime} → ${u.afterTime}${
          u.beforeSeq !== u.sequenceInTrip
            ? ` (row ${u.beforeSeq} → ${u.sequenceInTrip})`
            : ""
        }`
      );
    }

    await prisma.$transaction([
      ...updates.map((u) =>
        prisma.tripAssignment.update({
          where: { id: u.tripId },
          data: {
            sequenceInTrip: u.sequenceInTrip,
            pickupTime: u.afterTime,
            emailSentAt: null,
          },
        })
      ),
      prisma.routePlanOverride.create({
        data: {
          routePlanId: plan.id,
          changedById: "system",
          changeType: "PRESET_WEEK_SCHEDULE_SYNC",
          beforeState: JSON.stringify(
            updates.map((u) => ({ tripId: u.tripId, pickupTime: u.beforeTime }))
          ),
          afterState: JSON.stringify(
            updates.map((u) => ({ tripId: u.tripId, pickupTime: u.afterTime }))
          ),
          reason:
            "A pickup point keeps ONE pickup time for the whole week — applied the vehicle's canonical point schedule (PickupPoint.baseETA) to this day.",
        },
      }),
    ]);
  }

  console.log(
    `\nWeek schedule synced on ${changedPlans.size} plan(s), ${changedTrips} trip(s) updated; ${lockedPlans} locked plan(s) reported only.`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});