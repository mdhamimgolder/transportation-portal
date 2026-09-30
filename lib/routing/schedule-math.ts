/**
 * Pure 5-minute-grid schedule math (no Prisma, no fetch) shared by the
 * pickup-schedule sync, the corridor planner and the route analysis "Apply"
 * step. Kept dependency-free so it is unit-testable with `node:test`.
 */

/** All pickup times snap to this increment (5-minute grid). */
export const PICKUP_GRID_MINUTES = 5;

/** Round `minutes` down to the nearest 5-minute grid point (never < 0). */
export function snapPickupMinutesDown(minutes: number): number {
  return Math.max(0, Math.floor(minutes / PICKUP_GRID_MINUTES) * PICKUP_GRID_MINUTES);
}

/** Round `minutes` up to the nearest 5-minute grid point. */
export function snapPickupMinutesUp(minutes: number): number {
  return Math.ceil(minutes / PICKUP_GRID_MINUTES) * PICKUP_GRID_MINUTES;
}

/**
 * Back-calculate pickup times from a fixed office ARRIVAL (minutes from
 * midnight; late-night shifts use 1440+). `legMinutesToNext[i]` is the drive
 * from stop i to stop i+1, the last entry the drive from the last stop to the
 * office. Every pickup lands on the 5-minute grid, the last one ≥ 5 min before
 * arrival and every earlier one ≥ 5 min before the next (the late-night
 * spacing Facilities asked for). Throws when the chain would start before
 * midnight of the same day (route longer than the window allows).
 */
export function backCalculatePickupMinutes(
  arrivalMinutes: number,
  legMinutesToNext: ReadonlyArray<number>
): number[] {
  const n = legMinutesToNext.length;
  if (n === 0) return [];
  const raw: number[] = new Array(n);
  raw[n - 1] = arrivalMinutes - legMinutesToNext[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    raw[i] = raw[i + 1] - legMinutesToNext[i];
  }
  if (raw[0] < 0) {
    const total = legMinutesToNext.reduce((a, b) => a + b, 0);
    throw new Error(
      `route from ${n} stops takes ${total} min — more than the arrival window allows.`
    );
  }
  const out: number[] = new Array(n);
  out[n - 1] = snapPickupMinutesDown(raw[n - 1]);
  for (let i = n - 2; i >= 0; i--) {
    out[i] = snapPickupMinutesDown(Math.min(raw[i], out[i + 1] - PICKUP_GRID_MINUTES));
  }
  return out;
}
