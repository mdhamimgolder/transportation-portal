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

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  addressText: string;
}

const GEOCODER_BASE = (
  process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org"
).replace(/\/+$/, "");
// Nominatim usage policy asks for a valid identifying User-Agent.
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT || "transportation-portal/1.0 (route planning)";
const COUNTRY_CODES = process.env.GEOCODER_COUNTRY_CODES || "bd";

const cache = new Map<string, GeocodeResult[]>();

async function nominatimSearch(term: string, limit: number): Promise<GeocodeResult[]> {
  const url = new URL(`${GEOCODER_BASE}/search`);
  url.searchParams.set("q", term);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("countrycodes", COUNTRY_CODES);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": USER_AGENT,
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
  if (cached) return cached[0] ?? null;

  const results = await nominatimSearch(term, 3);
  cache.set(key, results);
  return results[0] ?? null;
}

/**
 * Return several candidate matches so Facilities can pick the right one
 * (used by the Route Setting → "Map an address" tool).
 */
export async function geocodeSearch(term: string, limit: number = 6): Promise<GeocodeResult[]> {
  const key = term.trim().toLowerCase();
  if (!key) return [];

  const cached = cache.get(key);
  if (cached) return cached;

  const results = await nominatimSearch(term, limit);
  cache.set(key, results);
  return results;
}