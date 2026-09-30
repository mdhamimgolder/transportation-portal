import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * REPAIR #5 — contiguous pickup-stop numbering for the TEST week.
 *
 * The route map numbers the pickup pins 1..n in stored drive order, so a
 * plan whose TripAssignment.sequenceInTrip starts at 2 or skips values
 * (e.g. 1,4,5) reads as "the count doesn't start at the first pickup / skips
 * numbers". Repair scripts #1-#4 fixed the live week (2026-09-21); the seeded
 * test-data week (2026-08-24) still has 11 such plans. This pass renumbers
 * every plan of that week contiguously 1..n in its current stored order —
 * pickup times and drive order are NEVER changed, only the numbering column.
 *
 * EXECUTED plans are history and are left untouched.
 *
 * Usage:  npx tsx _repair5-contiguous-sequence.ts             (preview)
 *         npx tsx _repair5-contiguous-sequence.ts --apply     (commit)
 */

const WEEK_START = new Date(Date.UTC(2026, 7, 24)); // Mon 24 Aug 2026, UTC midnight
const APPLY = process.argv.includes("--apply");

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function main() {
  const plans = await prisma.routePlan.findMany({
    where: { weekStartDate: WEEK_START },
    orderBy: [
      { dayOfWeek: "asc" },
      { vehicle: { vehicleNumber: "asc" } },
      { arrivalTime: "asc" },
    ],
    include: {
      vehicle: { select: { vehicleNumber: true } },
      tripAssignments: {
        orderBy: { sequenceInTrip: "asc" },
        select: { id: true, sequenceInTrip: true },
      },
    },
  });

  let plansChanged = 0;
  let tripsRenumbered = 0;
  let executedSkipped = 0;

  for (const plan of plans) {
    const trips = plan.tripAssignments;
    if (trips.length === 0) continue;
    if (trips.every((t, i) => t.sequenceInTrip === i + 1)) continue;

    if (plan.status === "EXECUTED") {
      executedSkipped++;
      console.log(
        `⏭️ ${plan.vehicle.vehicleNumber} ${plan.dayDate.toISOString().slice(0, 10)} [${plan.status}] is EXECUTED — left untouched.`
      );
      continue;
    }

    const changes = trips
      .map((t, i) => ({ tripId: t.id, from: t.sequenceInTrip, to: i + 1 }))
      .filter((c) => c.from !== c.to);
    if (changes.length === 0) continue;

    const label = `${DAY_NAMES[plan.dayOfWeek]} ${plan.dayDate.toISOString().slice(0, 10)} · ${plan.vehicle.vehicleNumber} · ${plan.arrivalTime} · ${plan.routeType} [${plan.status}]`;
    console.log(
      `${APPLY ? "✏️" : "👀"} ${label}: ${changes.length} row(s) renumbered`
    );
    for (const c of changes) {
      console.log(`      ${c.from} → ${c.to}`);
    }

    plansChanged++;
    tripsRenumbered += changes.length;

    if (!APPLY) continue;

    await prisma.$transaction([
      ...changes.map((c) =>
        prisma.tripAssignment.update({
          where: { id: c.tripId },
          data: { sequenceInTrip: c.to },
        })
      ),
      prisma.routePlanOverride.create({
        data: {
          routePlanId: plan.id,
          changedById: "system",
          changeType: "SEQUENCE_CONTIGUOUS_FIX",
          beforeState: JSON.stringify(
            changes.map((c) => ({ tripId: c.tripId, sequenceInTrip: c.from }))
          ),
          afterState: JSON.stringify(
            changes.map((c) => ({ tripId: c.tripId, sequenceInTrip: c.to }))
          ),
          reason:
            "Route-map pickup pins are numbered 1..n in stored drive order — renumbered the stored sequence contiguously so the count always starts at 1 on the first pickup with no skipped numbers.",
        },
      }),
    ]);
  }

  console.log(
    `\n${APPLY ? "Applied" : "Preview"}: ${plansChanged} plan(s), ${tripsRenumbered} trip(s) to renumber; ${executedSkipped} EXECUTED plan(s) skipped.` +
      (APPLY ? "" : "  Run with --apply to commit.")
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});