import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/routing/utils";
import type { RouteAnalysis } from "@/lib/routing/route-analysis.types";

/**
 * Read-only diagnostic: for one vehicle + week, verify that the STORED pickup
 * sequence (TripAssignment.sequenceInTrip — what the breakdown table and the
 * route map both draw) is PRACTICALLY consistent with the geography:
 *  1. leg distances between consecutive stops (stored vs greedy nearest-neighbor)
 *  2. distance-to-office trend (a chain pickup route should roughly approach)
 *  3. the cached route analysis' applied candidate stop order vs stored order
 */

const VEHICLE_NUMBER = process.argv[2] ?? "16-2930";
const WEEK_START = new Date(Date.UTC(2026, 8, 21)); // Mon 21 Sep 2026, UTC midnight

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Stop {
  tripId: string;
  seq: number;
  pickupTime: string | null;
  name: string;
  label: string;
  lat: number;
  lng: number;
}

function stopCoord(t: {
  pickupPoint: { address: { latitude: number; longitude: number } | null } | null;
  pickupAddress: { latitude: number; longitude: number } | null;
}): { lat: number; lng: number } | null {
  const a = t.pickupPoint?.address ?? t.pickupAddress;
  if (!a || a.latitude == null || a.longitude == null) return null;
  return { lat: a.latitude, lng: a.longitude };
}

async function main() {
  const vehicle = await prisma.vehicle.findFirst({
    where: { vehicleNumber: { contains: VEHICLE_NUMBER } },
  });
  if (!vehicle) {
    console.log(`No vehicle matching "${VEHICLE_NUMBER}".`);
    return;
  }
  console.log(`Vehicle: ${vehicle.vehicleNumber} (cap ${vehicle.capacity}, ${vehicle.officeLocation})`);
  console.log(`Week of ${WEEK_START.toISOString().slice(0, 10)}\n`);

  const plans = await prisma.routePlan.findMany({
    where: { vehicleId: vehicle.id, weekStartDate: WEEK_START },
    orderBy: [{ dayOfWeek: "asc" }, { arrivalTime: "asc" }],
    include: {
      tripAssignments: {
        orderBy: { sequenceInTrip: "asc" },
        include: {
          employee: { select: { fullName: true } },
          pickupPoint: { include: { address: true } },
          pickupAddress: true,
        },
      },
    },
  });

  if (plans.length === 0) {
    console.log("No RoutePlans for this vehicle/week.");
    return;
  }

  for (const plan of plans) {
    const office = {
      lat: plan.destinationLat ?? 0,
      lng: plan.destinationLng ?? 0,
    };
    const stops: Stop[] = [];
    for (const t of plan.tripAssignments) {
      const c = stopCoord(t);
      if (!c) continue;
      stops.push({
        tripId: t.id,
        seq: t.sequenceInTrip,
        pickupTime: t.pickupTime,
        name: t.employee.fullName,
        label: t.pickupPoint?.address?.label ?? t.pickupAddressId ?? "?",
        lat: c.lat,
        lng: c.lng,
      });
    }
    console.log(
      `\n=== ${DAY_NAMES[plan.dayOfWeek]} ${plan.dayDate.toISOString().slice(0, 10)} · ${plan.arrivalTime} · ${plan.routeType} · ${plan.status} · candidate=${plan.appliedCandidateId ?? "—"} — ${stops.length} stops ===`,
    );
    if (stops.length === 0) {
      console.log("  (no geocodable stops)");
      continue;
    }

    // 1. Stored-order legs vs greedy nearest-neighbor (same first stop).
    const pathKm = (list: Stop[]) =>
      list.reduce(
        (acc, s, i) =>
          acc + (i === 0 ? 0 : haversineDistance(list[i - 1].lat, list[i - 1].lng, s.lat, s.lng)),
        0,
      ) +
      haversineDistance(
        list[list.length - 1].lat,
        list[list.length - 1].lng,
        office.lat,
        office.lng,
      );
    const storedTotal = pathKm(stops);

    const nn: Stop[] = [stops[0]];
    const rest = stops.slice(1);
    while (rest.length > 0) {
      const cur = nn[nn.length - 1];
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < rest.length; i++) {
        const d = haversineDistance(cur.lat, cur.lng, rest[i].lat, rest[i].lng);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      nn.push(rest.splice(bestIdx, 1)[0]);
    }
    const nnTotal = pathKm(nn);
    const ratio = nnTotal / storedTotal;
    console.log(`  Stored total straight-line km (stops→office): ${storedTotal.toFixed(2)}`);
    console.log(`  Greedy nearest-neighbor km (same first stop):  ${nnTotal.toFixed(2)}`);
    console.log(
      `  Order efficiency: ${(ratio * 100).toFixed(0)}%` +
        (ratio > 1.25 ? "  ⚠️ stored order is geographically wasteful" : "  OK"),
    );

    // 2. Distance-to-office trend (chain pickup routes should approach).
    if (plan.routeType !== "PRESET_10PM") {
      let increases = 0;
      for (let i = 1; i < stops.length; i++) {
        const prev = haversineDistance(stops[i - 1].lat, stops[i - 1].lng, office.lat, office.lng);
        const cur = haversineDistance(stops[i].lat, stops[i].lng, office.lat, office.lng);
        if (cur - prev > 1) increases++;
      }
      console.log(
        `  Stops moving AWAY from office >1 km vs previous: ${increases}` +
          (increases > 0 ? "  ⚠️" : "  OK"),
      );
    }

    // 3. Cached analysis' applied candidate vs stored sequence.
    const analysis = plan.routeAnalysis as unknown as RouteAnalysis | null;
    if (!analysis || !analysis.candidates?.length) {
      console.log("  No cached analysis — map draws the stored order as-is.");
    } else {
      const applied =
        analysis.candidates.find((c) => c.id === (plan.appliedCandidateId ?? "current")) ??
        analysis.candidates.find((c) => c.id === "current");
      if (!applied) {
        console.log("  Analysis present but no applicable candidate.");
      } else {
        const candOrder = applied.order
          .map((wi) => analysis.waypoints[wi])
          .filter((w) => w && !w.isOffice)
          .flatMap((w) => w.tripIds);
        const same =
          candOrder.length === stops.length && candOrder.every((id, i) => id === stops[i].tripId);
        console.log(
          same
            ? "  Applied analysis candidate order == stored sequence:  MATCH ✅"
            : "  Applied analysis candidate order ≠ stored sequence:  MISMATCH ⚠️",
        );
        if (!same) {
          console.log(`    inputHash staleness hint: computedAt=${analysis.computedAt}`);
          console.log("    Map would draw (candidate order):");
          for (const tripId of candOrder) {
            const t = plan.tripAssignments.find((x) => x.id === tripId);
            console.log(
              `      - ${t ? `${t.employee.fullName} @${t.pickupTime ?? "--:--"}` : `(trip ${tripId} no longer on this plan!)`}`,
            );
          }
          console.log("    Table shows (stored order):");
          for (const s of stops) {
            console.log(`      - ${s.name} @${s.pickupTime ?? "--:--"}`);
          }
        }
      }
    }

    // Row-by-row table (what the UI table + route map draw).
    for (const s of stops) {
      const dOffice = haversineDistance(s.lat, s.lng, office.lat, office.lng).toFixed(1);
      console.log(
        `    #${s.seq} @${s.pickupTime ?? "--:--"}  ${s.name.padEnd(30)} ${s.lat.toFixed(5)},${s.lng.toFixed(5)}  ${dOffice}km→office`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
