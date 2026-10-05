import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import type { CacheTag } from "@/lib/cache-tags";

/**
 * Busts every cached read under `tag`.
 *
 * Inside a Server Action `updateTag` expires the entry immediately, so the
 * user who made the change sees it on the very next render (read-your-own-
 * writes). `updateTag` throws anywhere else (route handlers, `after()`
 * callbacks), where `revalidateTag(tag, "max")` marks it stale instead.
 */
export function invalidateCacheTag(tag: CacheTag): void {
  try {
    updateTag(tag);
  } catch {
    revalidateTag(tag, "max");
  }
}
