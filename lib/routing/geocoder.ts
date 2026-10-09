/**
 * OpenStreetMap-based geocoding via Nominatim — the free, keyless way to map a
 * free-text address to coordinates (used to resolve employee home addresses and
 * pickup points before OSRM routing).
 *
 * Defaults to the public nominatim.openstreetmap.org instance. Point
 * `GEOCODER_URL` at a self-hosted Nominatim (Docker) server in production, set
 * `GEOCODER_USER_AGENT` to a real contact string, and honour the ~1 req/sec
 * rate limit — searches are memoized in memory so repeat lookups are free.
 */

import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  addressText: string;
}

const REQUEST_TIMEOUT_MS = 8_000;
const MIN_REQUEST_GAP_MS = 1_100; // Nominatim policy: max ~1 request/second
const CACHE_MAX = 5_000;
const EMPTY_RESULT_TTL_MS = 10 * 60 * 1000; // re-try unresolved terms later

type CacheEntry = { results: GeocodeResult[]; expiresAt: number };
const cache = new Map<string, CacheEntry>();

// In-flight lookups by normalized term: concurrent callers asking for the
// same address share one request instead of each queueing a throttled
// Nominatim call (matters now that home resolution runs concurrently).
const inflight = new Map<string, Promise<GeocodeResult | null>>();

let lastRequestAt = 0;
let throttleChain: Promise<void> = Promise.resolve();

/** Serializes requests so concurrent callers respect the 1 req/s policy. */
function acquireRequestSlot(): Promise<void> {
  const slot = throttleChain.then(async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  });
  throttleChain = slot.catch(() => undefined);
  return slot;
}

function remember(key: string, results: GeocodeResult[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, {
    results,
    // Hits are stable; misses may be transient (outage) so they expire.
    expiresAt: results.length > 0 ? Number.POSITIVE_INFINITY : Date.now() + EMPTY_RESULT_TTL_MS,
  });
}

/** Base URL of the Nominatim server, without trailing slashes. */
function geocoderBase(): string {
  return env.GEOCODER_URL.replace(/\/+$/, "");
}

// Nominatim usage policy asks for a valid identifying User-Agent.
function userAgent(): string {
  return env.GEOCODER_USER_AGENT;
}

function countryCodes(): string {
  return env.GEOCODER_COUNTRY_CODES;
}

async function nominatimSearch(term: string, limit: number): Promise<GeocodeResult[]> {
  const url = new URL(`${geocoderBase()}/search`);
  url.searchParams.set("q", term);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("countrycodes", countryCodes());

  await acquireRequestSlot();
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "User-Agent": userAgent(),
      "Accept-Language": "en",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Geocoder request failed (${response.status}). Check GEOCODER_URL.`
    );
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item && typeof item === "object")
    .slice(0, limit)
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        lat: Number(row.lat),
        lng: Number(row.lon),
        displayName: String(row.display_name ?? term),
        addressText: term,
      };
    })
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/**
 * Best-effort geocode of a free-text address. Returns the top result or null
 * when nothing could be resolved. Never throws — callers can degrade gracefully.
 */
export async function geocodeAddress(term: string): Promise<GeocodeResult | null> {
  const key = term.trim().toLowerCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results[0] ?? null;

  const running = inflight.get(key);
  if (running) return running;

  const task: Promise<GeocodeResult | null> = nominatimSearch(term, 3).then(
    (results) => {
      remember(key, results);
      return results[0] ?? null;
    },
    (error) => {
      // Outage / timeout: degrade gracefully (the caller falls back), and
      // don't cache — the next run retries.
      logger.warn("geocoder", "lookup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  ).finally(() => {
    if (inflight.get(key) === task) inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}
