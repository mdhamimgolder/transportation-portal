import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * DIAGNOSTIC — for every vehicle with active pickup points, print:
 *   • the vehicle-level anchor (firstPickupTime / baseETA)
 *   • each point's STORED `baseETA` (what Route Setting shows / Facilities edits)
 *   • the pickup times actually stored on this week's PRESET_10PM plans
 * A point whose stored time disagrees with every plan is a stale snapshot.
 */

const WEEK_START = new Date(Date.UTC(2026, 8, 21));

async function main() {
  const vehicles = await prisma.vehicle.findMany({
    where: { pickupSequence: { some: { isActive: true } } },
    include: {
      pickupSequence: {
        where: { isActive: true },
        orderBy: { sequence: "asc" },
        select: { id: true, name: true, sequence: true, baseETA: true },
      },
    },
    orderBy: { vehicleNumber: "asc" },
  });

  const plans = await prisma.routePlan.findMany({
    where: { weekStartDate: WEEK_START, routeType: "PRESET_10PM" },
    include: {
      tripAssignments: {
        select: { pickupPointId: true, pickupTime: true },
      },
    },
  });

  // pointId → Set of times used on this week's plans
  const used = new Map<string, Set<string>>();
  for (const plan of plans) {
    for (const t of plan.tripAssignments) {
      if (!t.pickupPointId || !t.pickupTime) continue;
      const set = used.get(t.pickupPointId) ?? new Set<string>();
      set.add(t.pickupTime);
      used.set(t.pickupPointId, set);
    }
  }

  let stale = 0;
  for (const v of vehicles) {
    console.log(
      `\n🚌 ${v.vehicleNumber} | firstPickupTime=${v.firstPickupTime ?? "—"} | vehicle.baseETA=${v.baseETA ?? "—"} | office=${v.officeLocation ?? "—"}`
    );
    for (const p of v.pickupSequence) {
      const times = [...(used.get(p.id) ?? [])].sort();
      const match = times.length > 0 && times.includes(p.baseETA);
      if (times.length > 0 && !match) stale++;
      console.log(
        `   #${p.sequence} ${p.name} — stored=${p.baseETA} | used this week=${
          times.length ? times.join("/") : "—"
        }${times.length === 0 ? "" : match ? " ✅" : " ❌ STALE"}`
      );
    }
  }

  console.log(`\nPoints whose stored time appears on no plan this week: ${stale}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});