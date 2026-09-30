import "server-only";
import { logger } from "@/lib/logger";

/** Extract a human-readable message from anything thrown, including the
 * opaque DOM/fetch `ErrorEvent` objects the Neon serverless driver can throw
 * on a connection blip (they stringify as "[object ErrorEvent]" with no
 * `.message`, which is what the Next dev overlay was showing). */
export function dbErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const o = error as {
      message?: unknown;
      reason?: unknown;
      detail?: unknown;
      type?: unknown;
      target?: { url?: unknown };
      code?: unknown;
    };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.reason === "string" && o.reason) return o.reason;
    if (typeof o.detail === "string" && o.detail) return o.detail;
    const bits: string[] = [];
    if (typeof o.type === "string") bits.push(`type=${o.type}`);
    const url = o.target?.url;
    if (typeof url === "string") bits.push(`url=${url}`);
    if (typeof o.code === "string" || typeof o.code === "number")
      bits.push(`code=${String(o.code)}`);
    if (bits.length > 0) return `database connection error (${bits.join(", ")})`;
  }
  try {
    const s = String(error);
    if (s && s !== "[object Object]") return s;
  } catch {
    // fall through
  }
  return "unknown database error";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a Prisma query with one retry. Neon free-tier compute sleeps when idle
 * and the first query wakes it — that wake-up (or any transient websocket
 * blip) can take 10s+ and surface as an opaque `ErrorEvent`. Retrying once
 * after a short pause absorbs most of those without the page 500ing.
 */
export async function withDbRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        logger.warn("db", "query failed, retrying once", {
          label,
          error: dbErrorMessage(error),
        });
        await sleep(1000);
      }
    }
  }
  throw new Error(
    `Failed to load ${label}: ${dbErrorMessage(lastError)} — please retry.`
  );
}
