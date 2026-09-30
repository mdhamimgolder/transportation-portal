import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * Read-only diagnostic: for every PRESET_10PM plan, verify the stored trip
 * order (sequenceInTrip) matches the vehicle's PRESET pickup-point sequence
 * (PickupPoint.sequence, active rows only). Shared points = one visit, so the
 * rule is: pickupPoint.sequence must be non-decreasing along trip order.
 */

const WEEK_START = new Date(Date.UTC(2026, 8, 21)); // Mon 21 Sep 2026, UTC midnight

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

async function main() {
  const plans = await prisma.routePlan.findMany({
    where: {
      weekStartDate: WEEK_START,
      routeType: "PRESET_10PM",
    },
    orderBy: [{ dayOfWeek: "asc" }, { vehicleId: "asc" }],
    include: {
      vehicle: { select: { vehicleNumber: true } },
      tripAssignments: {
        orderBy: { sequenceInTrip: "asc" },
        include: {
          employee: { select: { fullName: true } },
          pickupPoint: { select: { sequence: true, name: true, isActive: true } },
        },
      },
    },
  });

  let total = 0;
  let violated = 0;
  for (const plan of plans) {
    total++;
    const stops = plan.tripAssignments.filter((t) => t.sequenceInTrip > 0);
    let bad = false;
    let timeBad = false;
    const rows: string[] = [];
    let prev = 0;
    const timeByPoint = new Map<number, string>();
    for (const t of stops) {
      const seq = t.pickupPoint?.sequence ?? -1;
      const mark = seq < prev ? "  ⚠️ OUT OF PRESET ORDER" : "";
      if (seq < prev) bad = true;
      let tmark = "";
      if (seq > 0 && t.pickupTime) {
        const seen = timeByPoint.get(seq);
        if (seen && seen !== t.pickupTime) {
          tmark = "  ⚠️ TIME MISMATCH (same point, different time)";
          timeBad = true;
        }
        if (!seen) timeByPoint.set(seq, t.pickupTime);
      }
      rows.push(
        `    #${t.sequenceInTrip} @${t.pickupTime ?? "--:--"}  point#${seq ?? "?"} (${t.pickupPoint?.name ?? "NO POINT"}${t.pickupPoint && !t.pickupPoint.isActive ? " INACTIVE!" : ""})  ${t.employee.fullName}${mark}${tmark}`,
      );
      prev = Math.max(prev, seq);
    }
    if (bad || timeBad) {
      violated++;
      console.log(
        `\n=== ${DAY_NAMES[plan.dayOfWeek]} ${plan.dayDate.toISOString().slice(0, 10)} · ${plan.vehicle.vehicleNumber} · ${plan.arrivalTime} · ${plan.status} — VIOLATES PRESET SEQUENCE`,
      );
      for (const r of rows) console.log(r);
    }
  }
  console.log(
    `\nChecked ${total} PRESET_10PM plans; ${violated} violate the vehicle's preset pickup-point sequence.`,
  );

  // Also: trips whose pickupPointId is null or points to an INACTIVE point.
  const orphaned = plans.flatMap((p) =>
    p.tripAssignments.filter((t) => !t.pickupPointId),
  );
  console.log(`Trips with no pickupPointId linked: ${orphaned.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
