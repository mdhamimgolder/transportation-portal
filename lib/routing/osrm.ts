/**
 * OSRM (Open Source Routing Machine) integration — the open-source, keyless
 * replacement for the Google Maps Distance Matrix / routing calls.
 *
 *  - Distance matrix  -> /table/v1/driving/...
 *  - Route/TSP order  -> /trip/v1/driving/...  (solves the travelling-salesman
 *                        ordering server-side, nearest-neighbour heuristic)
 *  - Single distance  -> derived from the cached matrix
 *
 * Defaults to the public OSRM demo server (no key, rate-limited). Point
 * `OSRM_SERVER_URL` at a self-hosted instance (Docker + a .osm.pbf extract)
 * for production-grade performance and coverage.
 */

import { prisma } from "@/lib/prisma";
import { haversineDistance } from "./utils";

export interface Location {
  lat: number;
  lng: number;
  name?: string;
}

export interface DistanceElement {
  distance: { value: number; text: string };
  duration: { value: number; text: string };
  status: "OK" | "NOT_FOUND" | "NoRoute" | "NoSegment";
}

export interface DistanceMatrixResponse {
  destinationAddresses: string[];
  originAddresses: string[];
  rows: Array<{ elements: DistanceElement[] }>;
  status: string;
}

const OSRM_BASE = (
  process.env.OSRM_SERVER_URL || "https://router.project-osrm.org"
).replace(/\/+$/, "");

const CACHE_PROVIDER = "OSRM";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days -- street geometry is stable

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatMin(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

function fallbackElement(
  origin: Location,
  destination: Location
): DistanceElement {
  const km = haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng);
  return {
    distance: { value: Math.round(km * 1000), text: `${km.toFixed(1)} km` },
    duration: { value: Math.round((km / 25) * 60), text: `${Math.round(km / 25 * 60)} min` },
    status: "NoSegment",
  };
}

const MIN_REQUEST_GAP_MS = 350; // public demo server is rate-limited
let lastRequestAt = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function osrmFetch(
  path: string,
  attempt = 1
): Promise<Record<string, unknown>> {
  const sinceLast = Date.now() - lastRequestAt;
  if (sinceLast < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - sinceLast);
  }
  lastRequestAt = Date.now();

  const response = await fetch(`${OSRM_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await sleep(500 * attempt);
      return osrmFetch(path, attempt + 1);
    }
    throw new Error(
      `OSRM request failed: ${response.status} ${response.statusText}`
    );
  }

  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    // Empty / non-JSON body is usually a rate-limit hiccup — retry.
    if (attempt < 4) {
      await sleep(500 * attempt);
      return osrmFetch(path, attempt + 1);
    }
    throw new Error("OSRM returned an unreadable response body");
  }
}

/**
 * Batch-load cached OSRM pairs for a full origin × destination matrix.
 */
async function loadCachedPairs(
  origins: Location[],
  destinations: Location[]
): Promise<Map<string, DistanceElement>> {
  const keyed = new Map<string, DistanceElement>();
  const flat: Array<{ lat: number; lng: number }> = [...origins, ...destinations];
  const from = new Map<string, { lat: number; lng: number }>();
  const pairs: Array<{ fromKey: string; toKey: string }> = [];

  flat.forEach((loc, idx) => {
    const origin = idx < origins.length;
    if (origin) {
      from.set(`${loc.lat},${loc.lng}`, loc);
    } else {
      pairs.push(
        ...[...from.values()].map((o) => ({
          fromKey: `${o.lat},${o.lng}`,
          toKey: `${loc.lat},${loc.lng}`,
        }))
      );
    }
  });

  const hits = await prisma.distanceMatrixCache.findMany({
    where: {
      provider: CACHE_PROVIDER,
      expiresAt: { gt: new Date() },
    },
    select: {
      fromLat: true,
      fromLng: true,
      toLat: true,
      toLng: true,
      distance: true,
      duration: true,
    },
  });

  const hitMap = new Map(
    hits.map((h) => [
      `${h.fromLat},${h.fromLng}->${h.toLat},${h.toLng}`,
      h,
    ])
  );

  for (const pair of pairs) {
    const cacheKey = `${pair.fromKey}->${pair.toKey}`;
    const hit = hitMap.get(cacheKey);
    if (!hit) continue;
    keyed.set(
      cacheKey,
      {
        distance: { value: Math.round(hit.distance * 1000), text: formatKm(hit.distance * 1000) },
        duration: { value: Math.round(hit.duration * 60), text: formatMin(hit.duration * 60) },
        status: "OK",
      }
    );
  }

  return keyed;
}

function keyForPair(origin: Location, destination: Location): string {
  return `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}`;
}

async function persistPairs(
  origins: Location[],
  destinations: Location[],
  elements: DistanceElement[][]
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
  const rows = [];
  for (let i = 0; i < origins.length; i++) {
    for (let j = 0; j < destinations.length; j++) {
      const el = elements[i][j];
      if (!el || el.status !== "OK") continue;
      rows.push({
        fromLat: origins[i].lat,
        fromLng: origins[i].lng,
        toLat: destinations[j].lat,
        toLng: destinations[j].lng,
        distance: el.distance.value / 1000,
        duration: el.duration.value / 60,
      });
    }
  }
  if (rows.length === 0) return;
  // Unique constraint on (fromLat, fromLng, toLat, toLng, provider) forces upsert.
  await Promise.all(
    rows.map((row) =>
      prisma.distanceMatrixCache.upsert({
        where: {
          fromLat_fromLng_toLat_toLng_provider: {
            fromLat: row.fromLat,
            fromLng: row.fromLng,
            toLat: row.toLat,
            toLng: row.toLng,
            provider: CACHE_PROVIDER,
          },
        },
        update: { distance: row.distance, duration: row.duration, expiresAt },
        create: { ...row, provider: CACHE_PROVIDER, expiresAt },
      })
    )
  );
}

/**
 * Distance matrix between every origin and every destination (compatible
 * signature with the old Google wrapper). Uses OSRM /table and the
 * DistanceMatrixCache table so repeated planning runs are cheap.
 */
export async function getDistanceMatrix(
  origins: Location[],
  destinations: Location[]
): Promise<DistanceMatrixResponse> {
  if (origins.length === 0 || destinations.length === 0) {
    throw new Error("Origins and destinations must not be empty");
  }

  const cache = await loadCachedPairs(origins, destinations);
  const rows: DistanceElement[][] = [];

  for (let i = 0; i < origins.length; i++) {
    const elements: DistanceElement[] = [];
    rows.push(elements);
    for (let j = 0; j < destinations.length; j++) {
      const cached = cache.get(keyForPair(origins[i], destinations[j]));
      if (cached) {
        elements.push(cached);
      } else {
        // Placeholder -- replaced below from the live table call (or a
        // great-circle fallback if OSRM cannot find a road connection).
        elements.push(null as unknown as DistanceElement);
      }
    }
  }

  const hasMissing = rows.some((row) => row.some((el) => el === null));
  if (hasMissing) {
    const coords = [...origins, ...destinations]
      .map((l) => `${l.lng},${l.lat}`)
      .join(";");
    const sources = origins.map((_, i) => i).join(";");
    const destinationsIdx = destinations
      .map((_, i) => origins.length + i)
      .join(";");
    const url = `/table/v1/driving/${coords}?annotations=distance,duration&sources=${sources}&destinations=${destinationsIdx}`;
    const data = (await osrmFetch(url)) as {
      code?: string;
      durations?: (number | null)[][];
      distances?: (number | null)[][];
    };

    if (!data.durations || !data.distances) {
      throw new Error(`OSRM table returned no matrix (code: ${data.code ?? "unknown"})`);
    }

    for (let i = 0; i < origins.length; i++) {
      for (let j = 0; j < destinations.length; j++) {
        if (rows[i][j] !== null) continue;
        const durationSec = data.durations?.[i]?.[j];
        const distanceMeters = data.distances?.[i]?.[j];
        if (durationSec == null || distanceMeters == null) {
          rows[i][j] = fallbackElement(origins[i], destinations[j]);
        } else {
          rows[i][j] = {
            distance: {
              value: Math.round(distanceMeters),
              text: formatKm(distanceMeters),
            },
            duration: {
              value: Math.round(durationSec),
              text: formatMin(durationSec),
            },
            status: "OK",
          };
        }
      }
    }

    await persistPairs(origins, destinations, rows);
  }

  return {
    originAddresses: [],
    destinationAddresses: [],
    status: "OK",
    rows: rows.map((elements) => ({ elements })),
  };
}

function findLocationIndex(locations: Location[], lng: number, lat: number): number {
  for (let i = 0; i < locations.length; i++) {
    if (
      Math.abs(locations[i].lng - lng) < 1e-6 &&
      Math.abs(locations[i].lat - lat) < 1e-6
    ) {
      return i;
    }
  }
  return -1;
}

export interface OptimizedRoute {
  route: number[];
  totalDistance: number;
  totalDuration: number;
  /** Travel time (minutes) for each consecutive leg in `route` order. */
  legDurationsMinutes: number[];
}

/**
 * Fallback ordering when OSRM /trip is unavailable: nearest-neighbour over
 * great-circle distances. Never throws.
 */
function nearestNeighborOrder(locations: Location[], startIndex: number): OptimizedRoute {
  const visited = new Set<number>([startIndex]);
  const route = [startIndex];
  const legDurationsMinutes: number[] = [];
  let current = startIndex;
  let totalKm = 0;
  let totalMin = 0;

  while (visited.size < locations.length) {
    let nearest = -1;
    let nearestKm = Infinity;
    for (let i = 0; i < locations.length; i++) {
      if (visited.has(i)) continue;
      const km = haversineDistance(
        locations[current].lat,
        locations[current].lng,
        locations[i].lat,
        locations[i].lng
      );
      if (km < nearestKm) {
        nearestKm = km;
        nearest = i;
      }
    }
    if (nearest === -1) break;
    route.push(nearest);
    const legMin = (nearestKm / 25) * 60;
    legDurationsMinutes.push(legMin);
    totalKm += nearestKm;
    totalMin += legMin;
    visited.add(nearest);
    current = nearest;
  }

  return { route, totalDistance: totalKm, totalDuration: totalMin, legDurationsMinutes };
}

/**
 * Solve a TSP-style pickup order starting at `startIndex` (defaults to index 0,
 * the office). Uses the OSRM /trip endpoint; falls back to great-circle
 * nearest-neighbour ordering if the trip call fails or returns unmappable
 * waypoints.
 */
export async function optimizeRoute(
  locations: Location[],
  startIndex: number = 0
): Promise<OptimizedRoute> {
  if (locations.length < 2) {
    return {
      route: [startIndex],
      totalDistance: 0,
      totalDuration: 0,
      legDurationsMinutes: [],
    };
  }

  try {
    const coords = locations.map((l) => `${l.lng},${l.lat}`).join(";");
    const url = `/trip/v1/driving/${coords}?roundtrip=true&source=first&destination=last&annotations=distance,duration&overview=simplified`;
    const data = (await osrmFetch(url)) as {
      code?: string;
      trips?: Array<{
        distance?: number;
        duration?: number;
        legs?: Array<{ duration?: number }>;
      }>;
      waypoints?: Array<{
        trips_index?: number;
        waypoint_index?: number;
        location?: [number, number];
      }>;
    };

    const firstTrip = Array.isArray(data.trips) ? data.trips[0] : undefined;
    if (data.code !== "Ok" || !firstTrip) {
      throw new Error(`OSRM trip returned code ${data.code ?? "unknown"}`);
    }

    const waypoints = (data.waypoints ?? [])
      .filter((w) => w.trips_index === 0)
      .sort((a, b) => (a.waypoint_index ?? 0) - (b.waypoint_index ?? 0));

    const route = waypoints.map((w) =>
      w.location
        ? findLocationIndex(locations, w.location[0], w.location[1])
        : -1
    );

    if (route.some((idx) => idx === -1)) {
      throw new Error("Unable to map trip waypoints back to input locations");
    }

    // Rotate so the trip starts at the requested start location (office).
    const startPos = route.indexOf(startIndex);
    const ordered =
      startPos > 0
        ? [...route.slice(startPos), ...route.slice(0, startPos)]
        : route;

    // Legs in the same order as `ordered`. A closed loop has one leg per
    // waypoint (leg i runs waypoint[i] -> waypoint[(i+1) mod N]); an open
    // chain has N-1 legs (leg j runs route[j] -> route[j+1]).
    const legDurations = (firstTrip.legs ?? []).map((leg) =>
      leg.duration != null ? leg.duration / 60 : 0
    );
    let rotatedLegs = legDurations;
    if (startPos > 0) {
      if (legDurations.length === ordered.length) {
        rotatedLegs = [
          ...legDurations.slice(startPos),
          ...legDurations.slice(0, startPos),
        ];
      } else {
        rotatedLegs = legDurations.slice(startPos);
      }
    }

    return {
      route: ordered,
      totalDistance: (firstTrip.distance ?? 0) / 1000,
      totalDuration: (firstTrip.duration ?? 0) / 60,
      legDurationsMinutes: rotatedLegs,
    };
  } catch {
    return nearestNeighborOrder(locations, startIndex);
  }
}

/**
 * Pickup times from a departure time and per-leg travel durations.
 * @param departureTime - Vehicle departure time "HH:mm"
 * @param legDurationsMinutes - Travel time of each consecutive stop in route order
 */
export function pickupTimesFromLegs(
  departureTime: string,
  legDurationsMinutes: number[]
): string[] {
  const [hours, minutes] = departureTime.split(":").map(Number);
  const departureMinutes = hours * 60 + minutes;
  let cumulativeMinutes = 0;

  return legDurationsMinutes.map((legMin) => {
    cumulativeMinutes += legMin;
    const totalMinutes = departureMinutes + cumulativeMinutes;
    const pickupHours = Math.floor(totalMinutes / 60) % 24;
    const pickupMins = Math.floor(totalMinutes % 60);
    return `${String(pickupHours).padStart(2, "0")}:${String(pickupMins).padStart(2, "0")}`;
  });
}

/**
 * Pickup times based on cumulative travel duration along an optimized route,
 * reading leg times from a *full* n×n distance matrix (rows = all locations).
 * @param route - Ordered location indices (already rotated to start with office)
 * @param distanceMatrix - Full distance matrix for all locations
 * @param departureTime - Vehicle departure time "HH:mm"
 */
export function calculatePickupTimes(
  route: number[],
  distanceMatrix: DistanceMatrixResponse,
  departureTime: string
): string[] {
  const [hours, minutes] = departureTime.split(":").map(Number);
  const departureMinutes = hours * 60 + minutes;
  const pickupTimes: string[] = [];
  let cumulativeMinutes = 0;

  for (let i = 1; i < route.length; i++) {
    const row = distanceMatrix.rows[route[i - 1]];
    const element = row?.elements[route[i]];
    if (element) {
      cumulativeMinutes += element.duration.value / 60;
    } else {
      cumulativeMinutes += 5; // unknown leg -- keep a small buffer
    }
    const totalMinutes = departureMinutes + cumulativeMinutes;
    const pickupHours = Math.floor(totalMinutes / 60) % 24;
    const pickupMins = Math.floor(totalMinutes % 60);
    pickupTimes.push(
      `${String(pickupHours).padStart(2, "0")}:${String(pickupMins).padStart(2, "0")}`
    );
  }

  return pickupTimes;
}