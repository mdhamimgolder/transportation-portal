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

import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { buildMatrixBatches } from "./matrix-core";
import {
  bearingDegrees,
  haversineDistance,
  waypointBearingParam,
  bearingsParam,
  radiusesParam,
  parseNoSegmentIndex,
  type BearingConstraint,
} from "./utils";

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

const CACHE_PROVIDER = "OSRM";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days -- street geometry is stable

/**
 * Base URL of the OSRM server, without trailing slashes. Read lazily (function,
 * never a module-level constant) so importing the routing engine never
 * validates env — the value is only resolved when a request is actually made.
 */
function osrmBase(): string {
  return env.OSRM_SERVER_URL.replace(/\/+$/, "");
}

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
  // `duration.value` is SECONDS everywhere else (OSRM + cache rows); 25 km/h.
  const minutes = (km / 25) * 60;
  return {
    distance: { value: Math.round(km * 1000), text: `${km.toFixed(1)} km` },
    duration: { value: Math.round(minutes * 60), text: `${Math.round(minutes)} min` },
    status: "NoSegment",
  };
}

/**
 * OSRM error surfaced with its machine-readable `code` (e.g. `NoSegment`,
 * `NoRoute`, `InvalidQuery`). For `NoSegment` the offending input coordinate
 * index is parsed from the message ("… for coordinate 3") so callers can drop
 * that candidate and retry.
 */
export class OsrmError extends Error {
  readonly code: string;
  readonly coordinateIndex: number | null;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(`OSRM ${code}: ${message}`);
    this.name = "OsrmError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.coordinateIndex = parseNoSegmentIndex(message);
  }
}

export { parseNoSegmentIndex };

const MIN_REQUEST_GAP_MS = 350; // public demo server is rate-limited
const REQUEST_TIMEOUT_MS = 10_000; // a hung socket must never stall RUN MAPPING
const MAX_ATTEMPTS = 4;
const PUBLIC_OSRM_HOST = "router.project-osrm.org";

/**
 * The public demo server is rate-limited, so requests to it are spaced
 * MIN_REQUEST_GAP_MS apart. Decided by HOSTNAME, not by whether the env var is
 * set — `.env.example` sets OSRM_SERVER_URL to the public server, and that
 * must still be throttled. A self-hosted instance runs unthrottled.
 */
function throttleRequests(): boolean {
  try {
    return new URL(osrmBase()).hostname === PUBLIC_OSRM_HOST;
  } catch {
    return true;
  }
}

let lastRequestAt = 0;
// Promise-chain mutex: concurrent callers queue for a slot instead of all
// reading the same `lastRequestAt` and firing together.
let throttleChain: Promise<void> = Promise.resolve();

function acquireRequestSlot(): Promise<void> {
  const slot = throttleChain.then(async () => {
    const sinceLast = Date.now() - lastRequestAt;
    if (sinceLast < MIN_REQUEST_GAP_MS) {
      await sleep(MIN_REQUEST_GAP_MS - sinceLast);
    }
    lastRequestAt = Date.now();
  });
  throttleChain = slot.catch(() => undefined);
  return slot;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter: ~400ms, 800ms, 1.6s (+0-250ms). */
function backoffMs(attempt: number): number {
  return 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

async function osrmFetch(
  path: string,
  attempt = 1
): Promise<Record<string, unknown>> {
  if (throttleRequests()) {
    await acquireRequestSlot();
  }

  let response: Response;
  try {
    response = await fetch(`${osrmBase()}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Network failure or timeout — transient, so retry with backoff.
    if (attempt < MAX_ATTEMPTS) {
      logger.warn("osrm", "request failed, retrying", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(backoffMs(attempt));
      return osrmFetch(path, attempt + 1);
    }
    throw new Error(
      `OSRM request failed after ${MAX_ATTEMPTS} attempts: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
      return osrmFetch(path, attempt + 1);
    }
    // OSRM answers 400 with `{ code, message }` (NoSegment / NoRoute /
    // InvalidQuery…). Surface that so callers can react to the code.
    if (response.status === 400) {
      let body: { code?: unknown; message?: unknown } = {};
      try {
        body = (await response.json()) as { code?: unknown; message?: unknown };
      } catch {
        // fall through to the generic error below
      }
      if (typeof body.code === "string") {
        throw new OsrmError(
          body.code,
          typeof body.message === "string" ? body.message : "",
          response.status
        );
      }
    }
    throw new Error(
      `OSRM request failed: ${response.status} ${response.statusText}`
    );
  }

  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    // Empty / non-JSON body is usually a rate-limit hiccup — retry.
    if (attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
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

  // Filter to the requested coordinate tuples — the unique compound index
  // (fromLat, fromLng, toLat, toLng, provider) makes this a cheap indexed
  // lookup instead of loading the ENTIRE cache table on every matrix call.
  const fromTuples = [...from.values()].map((o) => ({
    fromLat: o.lat,
    fromLng: o.lng,
  }));
  const toTuples = [...new Set(destinations.map((d) => `${d.lat},${d.lng}`))].map(
    (k) => {
      const [lat, lng] = k.split(",").map(Number);
      return { toLat: lat, toLng: lng };
    }
  );
  const hits = await prisma.distanceMatrixCache.findMany({
    where: {
      provider: CACHE_PROVIDER,
      expiresAt: { gt: new Date() },
      AND: [{ OR: fromTuples }, { OR: toTuples }],
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
  // Expired rows still occupy the unique key, so `skipDuplicates` below would
  // silently keep them and those pairs would miss the cache forever. Sweep
  // expired rows first (indexed on expiresAt) — this doubles as the cache
  // cleanup job.
  await prisma.distanceMatrixCache.deleteMany({
    where: { provider: CACHE_PROVIDER, expiresAt: { lte: now } },
  });
  // Batched instead of one upsert per pair (N×M round-trips). persistPairs
  // only runs for pairs that were MISSING from the cache, so they are inserts;
  // duplicates inside one batch (two riders sharing an address) carry the same
  // OSRM values, so `skipDuplicates` keeps exactly the row the old upsert
  // would have written.
  await prisma.distanceMatrixCache.createMany({
    data: rows.map((row) => ({ ...row, provider: CACHE_PROVIDER, expiresAt })),
    skipDuplicates: true,
  });
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
    for (const batch of buildMatrixBatches(origins, destinations)) {
      const needsBatch = batch.origins.some((_, rowIndex) =>
        batch.destinations.some(
          (_, columnIndex) =>
            rows[batch.originOffset + rowIndex][batch.destinationOffset + columnIndex] === null
        )
      );
      if (!needsBatch) continue;

      const coords = batch.coordinates
        .map((location) => `${location.lng},${location.lat}`)
        .join(";");
      const url = `/table/v1/driving/${coords}?annotations=distance,duration&sources=${batch.sourceIndices.join(";")}&destinations=${batch.destinationIndices.join(";")}`;
      const data = (await osrmFetch(url)) as {
        code?: string;
        durations?: (number | null)[][];
        distances?: (number | null)[][];
      };

      if (!data.durations || !data.distances) {
        throw new Error(`OSRM table returned no matrix (code: ${data.code ?? "unknown"})`);
      }

      for (let i = 0; i < batch.origins.length; i++) {
        for (let j = 0; j < batch.destinations.length; j++) {
          const originIndex = batch.originOffset + i;
          const destinationIndex = batch.destinationOffset + j;
          if (rows[originIndex][destinationIndex] !== null) continue;
          const durationSec = data.durations[batch.sourceIndices[i]]?.[batch.destinationIndices[j]];
          const distanceMeters = data.distances[batch.sourceIndices[i]]?.[batch.destinationIndices[j]];
          if (durationSec == null || distanceMeters == null) {
            rows[originIndex][destinationIndex] = fallbackElement(
              origins[originIndex],
              destinations[destinationIndex]
            );
          } else {
            rows[originIndex][destinationIndex] = {
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

/** In-memory cache of decoded driving polylines per leg (per process). */
const polylineCache = new Map<string, Array<{ lat: number; lng: number }>>();
/** Upper bound on cached legs so a long-lived process can't grow unbounded. */
const POLYLINE_CACHE_MAX = 20_000;

function rememberPolyline(key: string, points: Array<{ lat: number; lng: number }>): void {
  if (polylineCache.size >= POLYLINE_CACHE_MAX) {
    // Map iterates in insertion order — drop the oldest entry.
    const oldest = polylineCache.keys().next().value;
    if (oldest !== undefined) polylineCache.delete(oldest);
  }
  polylineCache.set(key, points);
}
/** In-flight polyline fetches — identical concurrent requests share one call. */
const polylineInFlight = new Map<
  string,
  Promise<Array<{ lat: number; lng: number }>>
>();

export type RoadPath = {
  line: [number, number][];
  totalKm: number;
  totalMin: number;
  legMinutes: number[];
};

const routePathCache = new Map<string, RoadPath>();
const ROUTE_PATH_CACHE_MAX = 500;

/** Server-side multi-waypoint route lookup shared by map clients. */
export async function getRoadPath(
  points: Location[],
  options: { constrainBearings?: boolean; overview?: "full" | "simplified" } = {}
): Promise<RoadPath | null> {
  if (points.length < 2 || points.length > 100) return null;

  const overview = options.overview ?? "full";
  const headings = points.map((point, index) => {
    const next = points[index + 1];
    if (!options.constrainBearings || !next) return null;
    if (point.lat === next.lat && point.lng === next.lng) return null;
    return bearingDegrees(point, next);
  });
  const bearings = options.constrainBearings
    ? waypointBearingParam(headings, 45)
    : "";
  const cacheKey = JSON.stringify([
    overview,
    bearings,
    points.map(({ lat, lng }) => [lat, lng]),
  ]);
  const cached = routePathCache.get(cacheKey);
  if (cached) return cached;

  const coordinates = points
    .map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`)
    .join(";");
  const query = new URLSearchParams({
    overview,
    geometries: "geojson",
    alternatives: "false",
    steps: "false",
    continue_straight: "true",
  });
  if (bearings) query.set("bearings", bearings);

  try {
    const data = (await osrmFetch(
      `/route/v1/driving/${coordinates}?${query.toString()}`
    )) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: number[][] };
        legs?: Array<{ duration?: number }>;
      }>;
    };
    const route = data.routes?.[0];
    const coordinatesOut = route?.geometry?.coordinates;
    if (
      data.code !== "Ok" ||
      !route ||
      !Array.isArray(coordinatesOut) ||
      coordinatesOut.length < 2 ||
      !Number.isFinite(route.distance) ||
      !Number.isFinite(route.duration)
    ) {
      return null;
    }

    const result: RoadPath = {
      line: coordinatesOut
        .filter((coordinate) =>
          Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
        )
        .map((coordinate) => [coordinate[1], coordinate[0]]),
      totalKm: route.distance! / 1000,
      totalMin: route.duration! / 60,
      legMinutes: (route.legs ?? []).map((leg) =>
        Math.max(1, Math.round((leg.duration ?? 0) / 60))
      ),
    };
    if (result.line.length < 2) return null;
    if (routePathCache.size >= ROUTE_PATH_CACHE_MAX) {
      const oldestKey = routePathCache.keys().next().value;
      if (oldestKey !== undefined) routePathCache.delete(oldestKey);
    }
    routePathCache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/** Decode a persisted geometry JSON value into [{ lat, lng }] points. Accepts
 * both the current convention (`[[lat, lng], ...]`) and the legacy object
 * shape (`[{ lat, lng }, ...]`) so older rows keep working. Returns null when
 * no usable points are found (caller then falls back to OSRM). */
function decodePolylinePoints(
  raw: unknown
): Array<{ lat: number; lng: number }> | null {
  if (!Array.isArray(raw)) return null;
  const out: Array<{ lat: number; lng: number }> = [];
  for (const p of raw) {
    if (
      Array.isArray(p) &&
      p.length >= 2 &&
      typeof p[0] === "number" &&
      typeof p[1] === "number"
    ) {
      out.push({ lat: p[0], lng: p[1] });
    } else if (
      p !== null &&
      typeof p === "object" &&
      typeof (p as { lat?: unknown }).lat === "number" &&
      typeof (p as { lng?: unknown }).lng === "number"
    ) {
      out.push({
        lat: (p as { lat: number }).lat,
        lng: (p as { lng: number }).lng,
      });
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * Load a persisted leg geometry (30-day TTL) — the polyline counterpart of
 * the DistanceMatrixCache lookup, so corridor geometry survives restarts and
 * re-runs instead of being re-fetched from the rate-limited OSRM server.
 */
async function loadCachedPolyline(
  from: Location,
  to: Location
): Promise<Array<{ lat: number; lng: number }> | null> {
  const row = await prisma.routePolylineCache.findUnique({
    where: {
      fromLat_fromLng_toLat_toLng_provider: {
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        provider: CACHE_PROVIDER,
      },
    },
    select: { points: true, expiresAt: true },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return decodePolylinePoints(row.points);
}

/** A leg a caller wants pre-warmed — the exact (from, to, bearing) tuple. */
export interface PolylineWarmKey {
  from: Location;
  to: Location;
  initialBearingDeg?: number | null;
  bearingRangeDeg?: number;
}

/**
 * Batch-load persisted leg geometries for a whole planning pass and seed the
 * in-memory cache with the EXACT keys the sweep will look up — ONE query per
 * pass instead of a DB round-trip per leg. Pure cache warm-up: every row is
 * byte-identical to what a per-leg lookup (or the original OSRM fetch) would
 * return, so planning judgments are unchanged — only fetch latency is removed.
 */
export async function warmPolylineCache(keys: PolylineWarmKey[]): Promise<void> {
  if (keys.length === 0) return;
  const fromTuples = [...new Set(keys.map((k) => `${k.from.lat},${k.from.lng}`))].map(
    (k) => {
      const [lat, lng] = k.split(",").map(Number);
      return { fromLat: lat, fromLng: lng };
    }
  );
  const toTuples = [...new Set(keys.map((k) => `${k.to.lat},${k.to.lng}`))].map(
    (k) => {
      const [lat, lng] = k.split(",").map(Number);
      return { toLat: lat, toLng: lng };
    }
  );
  const rows = await prisma.routePolylineCache.findMany({
    where: {
      provider: CACHE_PROVIDER,
      expiresAt: { gt: new Date() },
      AND: [{ OR: fromTuples }, { OR: toTuples }],
    },
    select: {
      fromLat: true,
      fromLng: true,
      toLat: true,
      toLng: true,
      points: true,
    },
  });
  if (rows.length === 0) return;
  const byPair = new Map<string, Array<{ lat: number; lng: number }>>();
  for (const row of rows) {
    const points = decodePolylinePoints(row.points);
    if (!points || points.length < 2) continue;
    byPair.set(`${row.fromLat},${row.fromLng}|${row.toLat},${row.toLng}`, points);
  }
  for (const k of keys) {
    const range = k.bearingRangeDeg ?? INITIAL_BEARING_RANGE;
    const bearings = waypointBearingParam(
      [k.initialBearingDeg ?? null, null],
      range
    );
    const memKey = polylineMemKey(k.from, k.to, bearings);
    if (polylineCache.has(memKey)) continue;
    const points = byPair.get(`${k.from.lat},${k.from.lng}|${k.to.lat},${k.to.lng}`);
    if (points) rememberPolyline(memKey, points);
  }
}

/** Write-through persist — best-effort; a failed write only costs a re-fetch.
 * Stored as `[[lat, lng], ...]` tuples (the decode convention). */
function persistPolyline(
  from: Location,
  to: Location,
  points: Array<{ lat: number; lng: number }>
): void {
  const tuplePoints = points.map((p) => [p.lat, p.lng]);
  void prisma.routePolylineCache
    .upsert({
      where: {
        fromLat_fromLng_toLat_toLng_provider: {
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: to.lat,
          toLng: to.lng,
          provider: CACHE_PROVIDER,
        },
      },
      update: { points: tuplePoints, expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
      create: {
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        provider: CACHE_PROVIDER,
        points: tuplePoints,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
    })
    .catch(() => undefined);
}

const PREFETCH_CONCURRENCY = 8;

/**
 * Fetches every polyline in `keys` that is not yet in the in-memory cache,
 * with bounded concurrency. Only runs against a self-hosted (unthrottled)
 * OSRM; on the public demo server it returns immediately so legs keep being
 * fetched lazily and spaced out. Failures are ignored — callers fall back
 * per leg.
 */
export async function prefetchRoutePolylines(keys: PolylineWarmKey[]): Promise<void> {
  if (throttleRequests()) return;
  const pending = keys.filter((k) => {
    const bearings = waypointBearingParam(
      [k.initialBearingDeg ?? null, null],
      k.bearingRangeDeg ?? INITIAL_BEARING_RANGE
    );
    return !polylineCache.has(polylineMemKey(k.from, k.to, bearings));
  });
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const key = pending[next++];
      await getRoutePolyline(key.from, key.to, {
        initialBearingDeg: key.initialBearingDeg ?? null,
        bearingRangeDeg: key.bearingRangeDeg,
      }).catch(() => undefined);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, pending.length) }, worker)
  );
}

function polylineMemKey(from: Location, to: Location, bearings: string): string {
  return `${from.lat.toFixed(6)},${from.lng.toFixed(6)}|${to.lat.toFixed(6)},${to.lng.toFixed(6)}|${bearings}`;
}

/**
 * Default allowed deviation (°) around the enforced initial heading. Kept well
 * under 180 so the opposite carriageway of a divided road is excluded (no
 * U-turn / loop around the divider), while still tolerating curve / junction
 * approach changes.
 */
const INITIAL_BEARING_RANGE = 45;

/** Options controlling how a leg's road geometry is requested. */
export interface RoutePolylineOptions {
  /**
   * Enforce the vehicle's starting orientation at `from`: the outgoing road
   * segment must head within `bearingRangeDeg` of this heading (degrees,
   * clockwise from north). Pass the bearing from `from` toward `to` so OSRM
   * snaps to the carriageway that faces the destination instead of the
   * opposite side (avoids map-matching detours/U-turns around dividers).
   */
  initialBearingDeg?: number | null;
  /** Allowed deviation around the initial heading (default
   * `INITIAL_BEARING_RANGE` = 45°). */
  bearingRangeDeg?: number;
}

/**
 * Actual driving geometry between two points — the OSRM route polyline
 * (full overview). The corridor planner uses this to test whether a home
 * really lies along a leg's ROAD path; straight lines cross lakes, gated
 * blocks and side lanes the vehicle can never drive through.
 *
 * When `initialBearingDeg` is supplied the first leg is constrained to leave
 * `from` heading toward `to` (see `RoutePolylineOptions`).
 */
export async function getRoutePolyline(
  from: Location,
  to: Location,
  options?: RoutePolylineOptions
): Promise<Array<{ lat: number; lng: number }>> {
  const initialBearing = options?.initialBearingDeg ?? null;
  const range = options?.bearingRangeDeg ?? INITIAL_BEARING_RANGE;
  const bearings = waypointBearingParam([initialBearing, null], range);
  const key = polylineMemKey(from, to, bearings);
  const hit = polylineCache.get(key);
  if (hit) return hit;

  const inFlight = polylineInFlight.get(key);
  if (inFlight) return inFlight;

  // The persisted cache is keyed by endpoints only. That is consistent
  // because the planner always derives the initial bearing from the same two
  // endpoints (`bearingDegrees(from, to)`), so one endpoint pair maps to one
  // geometry. A caller passing a different bearing for the same pair must not
  // share this cache.
  const task = (async () => {
    // Persisted cache first (parity with the distance matrix): re-runs and
    // post-restart runs skip the OSRM round-trip entirely.
    const dbHit = await loadCachedPolyline(from, to);
    if (dbHit) {
      rememberPolyline(key, dbHit);
      return dbHit;
    }

    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const data = await osrmFetch(
      `/route/v1/driving/${coords}?overview=full&geometries=geojson${bearings ? `&bearings=${bearings}` : ""}`
    );
    const routes = data.routes as
      | Array<{ geometry: { coordinates: Array<[number, number]> } }>
      | undefined;
    const line = routes?.[0]?.geometry?.coordinates ?? [];
    const points = line.map(([lng, lat]) => ({ lat, lng }));
    rememberPolyline(key, points);
    if (points.length >= 2) persistPolyline(from, to, points);
    return points;
  })();
  polylineInFlight.set(key, task);
  try {
    return await task;
  } finally {
    polylineInFlight.delete(key);
  }
}

/* ── Constraint-aware requests used by the route analysis ───────────── */

/** Per-waypoint snapping constraints shared by `/table` and `/route`. */
export interface WaypointConstraints {
  /** Heading filter per waypoint (`null` = unconstrained). */
  bearings?: ReadonlyArray<BearingConstraint | null>;
  /** Snap radius in metres per waypoint (`null` = unlimited). */
  radiuses?: ReadonlyArray<number | null>;
}

function constraintQuery(
  count: number,
  constraints: WaypointConstraints | undefined
): string {
  let q = "";
  if (constraints?.bearings && constraints.bearings.length === count) {
    const b = bearingsParam(constraints.bearings);
    if (b) q += `&bearings=${b}`;
  }
  if (constraints?.radiuses && constraints.radiuses.length === count) {
    const r = radiusesParam(constraints.radiuses);
    if (r) q += `&radiuses=${r}`;
  }
  return q;
}

function coordsPath(locations: ReadonlyArray<Location>): string {
  return locations.map((l) => `${l.lng.toFixed(6)},${l.lat.toFixed(6)}`).join(";");
}

export interface OsrmTable {
  /** Seconds; `null` where OSRM found no road connection. */
  durations: (number | null)[][];
  /** Metres; `null` where OSRM found no road connection. */
  distances: (number | null)[][];
  /** Snapped input locations, in input order. */
  snapped: Array<{ lat: number; lng: number } | null>;
}

/**
 * Full all-to-all `/table` for up to 100 locations with optional per-waypoint
 * bearing / radius filters. Throws `OsrmError` (code `NoSegment`, with the
 * coordinate index) when a filter leaves a waypoint nothing to snap to — the
 * caller decides which candidate to drop. Not cached: the bearing filter makes
 * the result specific to the snap, unlike the plain distance matrix.
 */
export async function getTableWithConstraints(
  locations: ReadonlyArray<Location>,
  constraints?: WaypointConstraints
): Promise<OsrmTable> {
  if (locations.length < 2) {
    throw new Error("A table needs at least two locations");
  }
  if (locations.length > 100) {
    throw new Error("OSRM table supports at most 100 locations");
  }
  const url =
    `/table/v1/driving/${coordsPath(locations)}?annotations=duration,distance` +
    constraintQuery(locations.length, constraints);
  const data = (await osrmFetch(url)) as {
    code?: string;
    message?: string;
    durations?: (number | null)[][];
    distances?: (number | null)[][];
    sources?: Array<{ location?: [number, number] } | null>;
  };
  if (data.code !== "Ok" || !data.durations || !data.distances) {
    throw new OsrmError(data.code ?? "Unknown", data.message ?? "table returned no matrix", 200);
  }
  return {
    durations: data.durations,
    distances: data.distances,
    snapped: (data.sources ?? []).map((s) =>
      s?.location ? { lat: s.location[1], lng: s.location[0] } : null
    ),
  };
}

/** One OSRM turn instruction (subset of the fields the analysis reads). */
export interface OsrmStep {
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    bearing_before: number;
    bearing_after: number;
    location: [number, number];
  };
}

export interface OsrmLeg {
  distance: number;
  duration: number;
  steps: OsrmStep[];
  annotation?: {
    nodes?: number[];
    distance?: number[];
    duration?: number[];
  };
}

export interface OsrmDetailedRoute {
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  legs: OsrmLeg[];
  /** Route geometry as [lat, lng] pairs. */
  geometry: Array<[number, number]>;
  /** Snapped waypoints in input order. */
  waypoints: Array<{ lat: number; lng: number; name: string }>;
}

/**
 * `/route` with turn steps, per-vertex OSM node annotations and full GeoJSON
 * geometry — everything the route analysis needs to judge a candidate
 * (U-turns, repeated road segments, real leg minutes) and to draw it.
 */
export async function getRouteDetailed(
  locations: ReadonlyArray<Location>,
  constraints?: WaypointConstraints
): Promise<OsrmDetailedRoute> {
  if (locations.length < 2) {
    throw new Error("A route needs at least two locations");
  }
  const url =
    `/route/v1/driving/${coordsPath(locations)}` +
    `?overview=full&geometries=geojson&steps=true&annotations=nodes,distance,duration&alternatives=false` +
    constraintQuery(locations.length, constraints);
  const data = (await osrmFetch(url)) as {
    code?: string;
    message?: string;
    routes?: Array<{
      distance: number;
      duration: number;
      legs: OsrmLeg[];
      geometry: { coordinates: Array<[number, number]> };
    }>;
    waypoints?: Array<{ location: [number, number]; name?: string }>;
  };
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route) {
    throw new OsrmError(data.code ?? "Unknown", data.message ?? "route returned no result", 200);
  }
  return {
    distance: route.distance,
    duration: route.duration,
    legs: route.legs ?? [],
    geometry: (route.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng]),
    waypoints: (data.waypoints ?? []).map((w) => ({
      lat: w.location[1],
      lng: w.location[0],
      name: w.name ?? "",
    })),
  };
}
