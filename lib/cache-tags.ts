/**
 * Shared Next.js data-cache tags for `unstable_cache` + `invalidateCacheTag`.
 *
 * Reads in `lib/queries/*` are cached under one of these tags; every mutation
 * that changes the underlying rows calls `invalidateCacheTag()` (see
 * `lib/cache-invalidate.ts`) with the same tag right after a successful write.
 * One source of truth (instead of string literals on both sides) keeps
 * invalidation from silently drifting away from the reads it busts.
 *
 * Tag → cached readers → invalidating writers:
 * - `settings` → `getTransportSettings`
 *                · `updateWeeklyLockSettingAction`
 * - `vehicles` → `getActiveVehicleDrivers`
 *                · every `actions/vehicle-driver.actions.ts` mutation
 *
 * Add a tag here only together with its invalidation calls — a cached read
 * without a matching writer serves stale data until the backstop expires.
 */
export const CACHE_TAGS = {
  settings: "settings",
  vehicles: "vehicles",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
