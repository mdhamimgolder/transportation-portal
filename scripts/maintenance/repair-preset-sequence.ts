import "dotenv/config";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computePickupSchedule,
  loadLearnedLegs,
} from "@/lib/routing/pickup-schedule";
import { officeCoordinatesFor } from "@/lib/constants/office-locations";

/**
 * REPAIR (run once): re-order every PRESET_10PM plan's trips to the vehicle's
 * Route Setting pickup-point sequence and re-derive pickup times from the
 * vehicle's schedule (same math as generate10PMRoutes). Writes a
 * PRESET_SEQUENCE_REPAIR override per repaired plan and clears the analysis
 * cache. EXECUTED plans are left untouched.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

async function main() {
  const plans = await prisma.routePlan.findMany({
    where: { routeType: "PRESET_10PM", status: { not: "EXECUTED" } },
    include: {
      vehicle: {
        select: { vehicleNumber: true, firstPickupTime: true, baseETA: true },
      },
      tripAssignments: {
        include: {
          employee: { select: { fullName: true } },
          pickupPoint: { include: { address: true } },
        },
      },
    },
  });

  const learned = await loadLearnedLegs("10PM");
  let repaired = 0;
  const skipped: string[] = [];

  for (const plan of plans) {
    const vehiclePoints = await prisma.pickupPoint.findMany({
      where: { vehicleId: plan.vehicleId, isActive: true },
      orderBy: { sequence: "asc" },
      include: { address: true },
    });
    if (vehiclePoints.length === 0) continue;

    const resolveSeq = (t: (typeof plan.tripAssignments)[number]) => {
      const p = t.pickupPoint;
      if (t.pickupType !== "PRESET_POINT" || !p) return null;
      const byId = vehiclePoints.find((vp) => vp.id === p.id);
      if (byId) return byId.sequence;
      if (p.addressId) {
        const byAddr = vehiclePoints.find((vp) => vp.addressId === p.addressId);
        if (byAddr) return byAddr.sequence;
      }
      const name = p.name?.trim().toLowerCase();
      if (name) {
        const byName = vehiclePoints.find(
          (vp) => vp.name.trim().toLowerCase() === name
        );
        if (byName) return byName.sequence;
      }
      return null;
    };

    const current = [...plan.tripAssignments]
      .filter((t) => t.sequenceInTrip > 0)
      .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip);
    const ordered = [...current].sort((a, b) => {
      const sa = resolveSeq(a) ?? Number.POSITIVE_INFINITY;
      const sb = resolveSeq(b) ?? Number.POSITIVE_INFINITY;
      return sa - sb;
    });

    // Violation: in the STORED order, some trip sits after a stop with a
    // greater preset sequence (the sorted `ordered` never violates by design).
    let violates = false;
    let prev = 0;
    for (const t of current) {
      const s = resolveSeq(t);
      if (s != null) {
        if (s < prev) violates = true;
        prev = Math.max(prev, s);
      }
    }
    if (!violates) continue;

    // Re-derive the schedule over the vehicle's FULL active point sequence
    // (same as the generator) so every rider gets their point's taught time.
    const office = officeCoordinatesFor(plan.officeLocation ?? "Regnum");
    const schedule = computePickupSchedule(
      {
        firstPickupTime: plan.vehicle.firstPickupTime ?? null,
        baseETA: plan.vehicle.baseETA ?? null,
        defaultArrival: "22:00",
      },
      vehiclePoints.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.address?.latitude ?? null,
        longitude: p.address?.longitude ?? null,
        key: p.address ? `addr:${p.address.id}` : null,
      })),
      office,
      learned
    );
    if (!schedule.success) {
      skipped.push(
        `${plan.vehicle.vehicleNumber} ${plan.dayDate.toISOString().slice(0, 10)}: ${schedule.error}`
      );
      continue;
    }
    const timeByPointId = new Map(schedule.points.map((u) => [u.id, u.pickup]));
    const seqByPointId = new Map(vehiclePoints.map((p) => [p.id, p.sequence]));

    const before = current.map(
      (t) => `${t.employee.fullName}(#${t.sequenceInTrip}@${t.pickupTime})`
    );
    const updates: ReturnType<typeof prisma.tripAssignment.update>[] = [];
    let timeChanges = 0;
    ordered.forEach((t, i) => {
      const newTime = timeByPointId.get(t.pickupPointId ?? "") ?? t.pickupTime;
      if (newTime !== t.pickupTime) timeChanges++;
      updates.push(
        prisma.tripAssignment.update({
          where: { id: t.id },
          data: {
            sequenceInTrip: i + 1,
            pickupTime: newTime,
            ...(newTime !== t.pickupTime ? { emailSentAt: null } : {}),
          },
        })
      );
    });
    const after = ordered.map((t, i) => {
      const seq = t.pickupPointId ? seqByPointId.get(t.pickupPointId) : null;
      const time = timeByPointId.get(t.pickupPointId ?? "") ?? t.pickupTime;
      return `${t.employee.fullName}(point#${seq}→#${i + 1}@${time})`;
    });

    await prisma.$transaction([
      ...updates,
      prisma.routePlan.update({
        where: { id: plan.id },
        data: { routeAnalysis: Prisma.JsonNull, appliedCandidateId: null },
      }),
      prisma.routePlanOverride.create({
        data: {
          routePlanId: plan.id,
          changedById: "system",
          changeType: "PRESET_SEQUENCE_REPAIR",
          beforeState: JSON.stringify({ order: before }),
          afterState: JSON.stringify({ order: after }),
          reason:
            "Stored trip order violated the vehicle's Route Setting pickup-point sequence — re-ordered and re-timed from the preset schedule.",
        },
      }),
    ]);
    repaired++;
    console.log(
      `✅ ${DAY_NAMES[plan.dayOfWeek]} ${plan.dayDate.toISOString().slice(0, 10)} · ${plan.vehicle.vehicleNumber} · ${plan.status} — ${updates.length} trips fixed (${timeChanges} time changes)`
    );
    console.log(`   before: ${before.join(" → ")}`);
    console.log(`   after:  ${after.join(" → ")}`);
  }

  console.log(`\nRepaired ${repaired} plan(s).`);
  if (skipped.length) {
    console.log("Skipped:");
    for (const s of skipped) console.log(`  - ${s}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
