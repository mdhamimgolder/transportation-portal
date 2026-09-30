import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * GLOBAL check: every rider sharing one pickup point (same plan = same
 * vehicle/day/shift) must have the SAME pickup time. Scans ALL weeks and all
 * route types. Also reports the per-point time spread across days/weeks for
 * one vehicle+shift (informational).
 */

async function main() {
  const trips = await prisma.tripAssignment.findMany({
    where: { pickupPointId: { not: null }, pickupTime: { not: null } },
    select: {
      id: true,
      pickupTime: true,
      sequenceInTrip: true,
      pickupPointId: true,
      routePlanId: true,
      employee: { select: { fullName: true } },
      pickupPoint: { select: { name: true } },
      routePlan: {
        select: {
          dayDate: true,
          status: true,
          routeType: true,
          vehicle: { select: { vehicleNumber: true } },
        },
      },
    },
  });

  // Group by plan + point.
  const byPlanPoint = new Map<
    string,
    { point: string; vehicle: string; day: Date; status: string; type: string; trips: typeof trips }
  >();
  for (const t of trips) {
    const key = `${t.routePlanId}|${t.pickupPointId}`;
    const g = byPlanPoint.get(key) ?? {
      point: t.pickupPoint?.name ?? "?",
      vehicle: t.routePlan.vehicle.vehicleNumber,
      day: t.routePlan.dayDate,
      status: t.routePlan.status,
      type: t.routePlan.routeType,
      trips: [] as typeof trips,
    };
    g.trips.push(t);
    byPlanPoint.set(key, g);
  }

  let badGroups = 0;
  for (const [, g] of byPlanPoint) {
    const times = new Set(g.trips.map((t) => t.pickupTime));
    if (times.size <= 1) continue;
    badGroups++;
    const byTime = new Map<string, string[]>();
    for (const t of g.trips) {
      const list = byTime.get(t.pickupTime!) ?? [];
      list.push(t.employee.fullName);
      byTime.set(t.pickupTime!, list);
    }
    console.log(
      `⚠️ ${g.vehicle} ${g.day.toISOString().slice(0, 10)} [${g.type}/${g.status}] point "${g.point}": ` +
        [...byTime.entries()].map(([time, names]) => `${time} ×${names.length}`).join(" | "),
    );
  }

  // Cross-plan variance per point (same vehicle, same shift label plans):
  const byVehiclePoint = new Map<string, Map<string, Set<string>>>();
  for (const t of trips) {
    const key = `${t.routePlanId}`;
    void key;
    const vk = t.routePlan.vehicle.vehicleNumber;
    const pk = t.pickupPointId!;
    const byWeek = byVehiclePoint.get(`${vk}|${pk}`) ?? new Map<string, Set<string>>();
    const wk = t.routePlan.dayDate.toISOString().slice(0, 10);
    const set = byWeek.get(wk) ?? new Set<string>();
    set.add(t.pickupTime!);
    byWeek.set(wk, set);
    byVehiclePoint.set(`${vk}|${pk}`, byWeek);
  }
  let variance = 0;
  for (const [key, byWeek] of byVehiclePoint) {
    const allTimes = new Set<string>();
    for (const set of byWeek.values()) for (const v of set) allTimes.add(v);
    if (allTimes.size > 1) {
      variance++;
      console.log(
        `ℹ️ cross-day variance: ${key} → ${[...byWeek.entries()]
          .map(([d, s]) => `${d}:${[...s].join("/")}`)
          .join(", ")}`,
      );
    }
  }

  console.log(
    `\nGroups with mixed times inside one plan: ${badGroups}; points with cross-day variance: ${variance}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
