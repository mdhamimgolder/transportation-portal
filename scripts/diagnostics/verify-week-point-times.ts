import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * VERIFIER — the whole live week must obey two rules for PRESET routes:
 *   1. every rider on one pickup point shares that point's ONE time
 *      (same time on Monday AND Friday, matching Route Setting's `baseETA`);
 *   2. the row order follows the vehicle's pickup-point sequence, and the
 *      pickup times never decrease down the column.
 * Read-only: prints violations and exits non-zero when any are found.
 */

const WEEK_START = new Date(Date.UTC(2026, 8, 21));

async function main() {
  const plans = await prisma.routePlan.findMany({
    where: { weekStartDate: WEEK_START },
    include: {
      vehicle: {
        select: {
          vehicleNumber: true,
          pickupSequence: {
            where: { isActive: true },
            orderBy: { sequence: "asc" },
            select: { id: true, sequence: true, name: true, baseETA: true },
          },
        },
      },
      tripAssignments: {
        include: {
          employee: { select: { fullName: true } },
          pickupPoint: { select: { id: true, name: true, baseETA: true } },
        },
      },
    },
    orderBy: [{ vehicleId: "asc" }, { dayDate: "asc" }],
  });

  const preset = plans.filter(
    (p) => p.routeType === "PRESET_10PM" && p.tripAssignments.length > 0
  );
  const weekTimes = new Map<string, Map<string, Set<string>>>(); // pointId → { label, times }
  let mixed = 0;
  let offSchedule = 0;
  let outOfOrder = 0;
  let decreasing = 0;

  for (const plan of preset) {
    const day = plan.dayDate.toISOString().slice(0, 10);
    const label = `${plan.vehicle.vehicleNumber} ${day} [${plan.status}]`;
    const rows = [...plan.tripAssignments].sort(
      (a, b) => a.sequenceInTrip - b.sequenceInTrip
    );

    // (1) one time per point inside the plan
    const byPoint = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.pickupPointId) continue;
      const g = byPoint.get(r.pickupPointId) ?? [];
      g.push(r);
      byPoint.set(r.pickupPointId, g);
    }
    for (const [pointId, group] of byPoint) {
      const times = new Set(group.map((r) => r.pickupTime));
      if (times.size > 1) {
        mixed++;
        console.log(
          `❌ ${label}: "${group[0].pickupPoint?.name}" riders have mixed times ${[...times].join("/")}`
        );
      }
      const timesByLabel = weekTimes.get(pointId) ?? new Map<string, Set<string>>();
      const set = timesByLabel.get(label) ?? new Set<string>();
      for (const t of times) if (t) set.add(t);
      timesByLabel.set(label, set);
      weekTimes.set(pointId, timesByLabel);

      // point time must equal the Route Setting value
      const stored = group[0].pickupPoint?.baseETA;
      if (stored && times.size === 1 && !times.has(stored)) {
        offSchedule++;
        console.log(
          `⚠️ ${label}: "${group[0].pickupPoint?.name}" uses ${[...times][0]} but Route Setting says ${stored}`
        );
      }

      // (2) sequence follows the configured point order
      const configured = plan.vehicle.pickupSequence.find((p) => p.id === pointId);
      if (configured) {
        const expected = plan.vehicle.pickupSequence.filter((p) =>
          rows.some((r) => r.pickupPointId === p.id)
        );
        const actualOrder = expected.map((p) =>
          Math.min(
            ...rows
              .filter((r) => r.pickupPointId === p.id)
              .map((r) => r.sequenceInTrip)
          )
        );
        const sorted = [...actualOrder].every(
          (v, i) => i === 0 || v >= actualOrder[i - 1]
        );
        if (!sorted) {
          outOfOrder++;
          console.log(
            `❌ ${label}: point rows out of Route Setting sequence (${expected
              .map((p) => p.name)
              .join(" → ")}), rows at ${actualOrder.join(",")}`
          );
        }
      }
    }

    // (2b) pickup times never decrease down the column
    const times = rows.map((r) => r.pickupTime).filter((t): t is string => !!t);
    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1]) {
        decreasing++;
        console.log(
          `❌ ${label}: pickup time decreases at row ${i + 1} (${times[i - 1]} → ${times[i]})`
        );
        break;
      }
    }
  }

  // (1b) one time per point across the whole week
  let weekVariance = 0;
  for (const [pointId, byLabel] of weekTimes) {
    const all = new Set<string>();
    for (const set of byLabel.values()) for (const t of set) all.add(t);
    if (all.size > 1) {
      weekVariance++;
      console.log(
        `❌ point ${pointId} has different times across the week: ${[
          ...byLabel.entries(),
        ]
          .map(([l, s]) => `${l}:${[...s].join("/")}`)
          .join(", ")}`
      );
    }
  }

  console.log(
    `\nPRESET plans checked: ${preset.length} | mixed-times-inside-plan: ${mixed} | ` +
      `points off their Route Setting time: ${offSchedule} | out-of-sequence: ${outOfOrder} | ` +
      `decreasing pickup column: ${decreasing} | points with week variance: ${weekVariance}`
  );
  const ok =
    mixed === 0 && offSchedule === 0 && outOfOrder === 0 && decreasing === 0 && weekVariance === 0;
  console.log(ok ? "\n✅ ALL CHECKS PASSED" : "\n❌ VIOLATIONS FOUND");
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});