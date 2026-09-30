import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * REPAIR #3: same-point riders must share the point's pickup time. For every
 * PRESET_10PM plan (not EXECUTED), any rider whose point-group has multiple
 * distinct times is set to the ANCHOR time — the time of the group's earliest
 * sequenceInTrip rider (the one the original schedule produced). Audited as
 * PRESET_TIME_SYNC.
 */

async function main() {
  const plans = await prisma.routePlan.findMany({
    where: { routeType: "PRESET_10PM", status: { not: "EXECUTED" } },
    include: {
      vehicle: { select: { vehicleNumber: true } },
      tripAssignments: {
        include: {
          employee: { select: { fullName: true } },
          pickupPoint: true,
        },
      },
    },
  });

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  let repaired = 0;

  for (const plan of plans) {
    const current = [...plan.tripAssignments]
      .filter((t) => t.sequenceInTrip > 0)
      .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip);

    // Group by point; anchor = earliest-position rider of the group.
    const groupByPoint = new Map<string, typeof current>();
    for (const t of current) {
      if (!t.pickupPointId) continue;
      const g = groupByPoint.get(t.pickupPointId) ?? [];
      g.push(t);
      groupByPoint.set(t.pickupPointId, g);
    }

    const updates: ReturnType<typeof prisma.tripAssignment.update>[] = [];
    for (const [, group] of groupByPoint) {
      if (group.length < 2) continue;
      const times = new Set(group.map((t) => t.pickupTime));
      if (times.size <= 1) continue;
      const anchor = group[0]; // earliest sequenceInTrip in stored order
      const anchorTime = anchor.pickupTime;
      for (const t of group) {
        if (t.pickupTime !== anchorTime) {
          updates.push(
            prisma.tripAssignment.update({
              where: { id: t.id },
              data: {
                pickupTime: anchorTime,
                emailSentAt: null,
              },
            })
          );
          console.log(
            `  ${plan.vehicle.vehicleNumber} ${plan.dayDate.toISOString().slice(0, 10)}: ${t.employee.fullName} ${t.pickupTime} → ${anchorTime} (point sync)`
          );
        }
      }
    }

    if (updates.length === 0) continue;
    await prisma.$transaction([
      ...updates,
      prisma.routePlanOverride.create({
        data: {
          routePlanId: plan.id,
          changedById: "system",
          changeType: "PRESET_TIME_SYNC",
          beforeState: JSON.stringify({ synced: updates.length }),
          afterState: JSON.stringify({ synced: updates.length }),
          reason:
            "Riders sharing a preset pickup point had different pickup times (per-row re-time stagger) — synced each group to its anchor rider's time.",
        },
      }),
    ]);
    repaired++;
  }

  console.log(`\nTime-sync applied to ${repaired} plan(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
