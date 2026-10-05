/**
 * Route generation utilities for advanced clustering and optimization
 */

/**
 * Calculate great-circle distance between two coordinates (Haversine formula)
 * Useful for initial clustering before API calls
 * @param lat1 - First latitude
 * @param lng1 - First longitude
 * @param lat2 - Second latitude
 * @param lng2 - Second longitude
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Great-circle initial bearing (degrees, clockwise from north, 0..360) from
 * `a` to `b`. Used to enforce the vehicle's STARTING heading at a pickup so
 * OSRM snaps to the carriageway that actually heads toward the destination
 * instead of the opposite side of a divided road (which forces a U-turn /
 * loop around the divider).
 */
export function bearingDegrees(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Build the OSRM `bearings` value constraining the outgoing heading at EVERY
 * intermediate waypoint to face the NEXT point, so the vehicle leaves each
 * stop on the carriageway that heads toward the following stop — regardless
 * of which side of the road the stop's lat/lng pin sits on. A pin on the
 * right side of a divided road (e.g. a pickup point on the far carriageway)
 * must not force the route to start on that side when the next stop lies the
 * other way.
 *
 * `headings[i]` is the heading to enforce at waypoint i (`null` = leave that
 * waypoint unconstrained). Returns "" when there is nothing to constrain.
 *
 * Format per OSRM: `bearings={value},{range};{value},{range};...` with a
 * `;`-separated element per waypoint; an empty element means "no
 * restriction". The range is the allowed deviation (0..180) around the
 * heading — keeping it well under 180 excludes the opposite carriageway.
 */
export function waypointBearingParam(
  headings: Array<number | null | undefined>,
  rangeDeg: number
): string {
  if (headings.length < 2 || rangeDeg < 0) return "";
  const elements = headings.map((heading) => {
    if (heading == null || !Number.isFinite(heading)) return "";
    const h = Math.round(((heading % 360) + 360) % 360);
    return `${h},${rangeDeg}`;
  });
  if (elements.every((el) => el === "")) return "";
  return elements.join(";");
}

/** One waypoint's OSRM bearing filter: heading (° clockwise from north) ± range. */
export interface BearingConstraint {
  deg: number;
  range: number;
}

/** Normalize any heading to the integer range 0..359. */
export function normalizeHeading(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/**
 * Build the OSRM `bearings` query value for an arbitrary set of per-waypoint
 * constraints (`null` = unconstrained). Returns "" when nothing is
 * constrained so callers can omit the parameter entirely.
 */
export function bearingsParam(
  entries: ReadonlyArray<BearingConstraint | null | undefined>
): string {
  if (!entries.some((e) => e && Number.isFinite(e.deg))) return "";
  return entries
    .map((e) =>
      e && Number.isFinite(e.deg)
        ? `${normalizeHeading(e.deg)},${Math.max(0, Math.min(180, Math.round(e.range)))}`
        : ""
    )
    .join(";");
}

/**
 * Build the OSRM `radiuses` query value (metres per waypoint, `null` =
 * unlimited). Returns "" when every entry is unlimited.
 */
export function radiusesParam(
  entries: ReadonlyArray<number | null | undefined>
): string {
  if (!entries.some((r) => r != null && Number.isFinite(r))) return "";
  return entries
    .map((r) => (r != null && Number.isFinite(r) ? String(Math.round(r)) : "unlimited"))
    .join(";");
}

/** OSRM "Could not find a matching segment for coordinate 3" → 3 (null if absent). */
export function parseNoSegmentIndex(message: string): number | null {
  const m = /coordinate\s+(\d+)/i.exec(message ?? "");
  return m ? Number(m[1]) : null;
}

/** Smallest absolute angle (0..180) between two headings in degrees. */
export function headingDifference(a: number, b: number): number {
  const d = Math.abs(normalizeHeading(a) - normalizeHeading(b));
  return d > 180 ? 360 - d : d;
}

export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeString(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
