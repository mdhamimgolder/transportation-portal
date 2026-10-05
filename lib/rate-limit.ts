import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type RateLimitRule = {
  /** Bucket namespace, e.g. "login:ip". */
  name: string;
  /** Max hits allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/** Brute-force / email-bombing limits for the public auth entry points. */
export const RATE_LIMITS = {
  loginByIp: { name: "login:ip", limit: 30, windowSeconds: 15 * 60 },
  loginByEmail: { name: "login:email", limit: 10, windowSeconds: 15 * 60 },
  resetRequestByIp: { name: "reset:ip", limit: 10, windowSeconds: 60 * 60 },
  resetRequestByEmail: { name: "reset:email", limit: 3, windowSeconds: 60 * 60 },
  resetSubmitByIp: { name: "reset-submit:ip", limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Best-effort client IP (first X-Forwarded-For hop, as set by the platform). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

/**
 * Counts one hit against `rule` for `subject` and reports whether it is still
 * within the limit. Fixed-window counter in one atomic upsert, so concurrent
 * requests across serverless instances share the same count.
 *
 * Fails OPEN: if the counter itself can't be written (DB blip), the request is
 * allowed rather than locking every user out of login.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string
): Promise<boolean> {
  const key = `${rule.name}:${subject.toLowerCase()}`;
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."windowStart" < NOW() - make_interval(secs => ${rule.windowSeconds})
          THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "windowStart" = CASE
          WHEN "RateLimitBucket"."windowStart" < NOW() - make_interval(secs => ${rule.windowSeconds})
          THEN NOW() ELSE "RateLimitBucket"."windowStart" END
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 0);
    return count <= rule.limit;
  } catch (error) {
    logger.warn("rate-limit", "counter unavailable, allowing request", {
      rule: rule.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/** Clears a subject's counter (e.g. after a successful login). */
export async function resetRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  await prisma.rateLimitBucket
    .delete({ where: { key: `${rule.name}:${subject.toLowerCase()}` } })
    .catch(() => undefined);
}

/** Housekeeping: drop buckets whose window ended long ago. */
export async function pruneRateLimitBuckets(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: cutoff } } });
}
