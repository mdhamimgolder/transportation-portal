import { NextResponse } from "next/server";
import { productionWarnings } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Liveness/readiness probe for uptime monitoring and post-deploy smoke tests.
 *
 * Deliberately dependency-light and defensive: the Prisma client is imported
 * *inside* the handler so a broken environment configuration returns a readable
 * 503 JSON body instead of a 500 HTML error page. `proxy.ts` already excludes
 * this path from the auth gate.
 *
 * The endpoint is PUBLIC, so it reports only up/down. The underlying DB error
 * and configuration warnings (which name missing secrets) go to the server
 * log, never the response body.
 *
 *   200 { status: "ok",       db: "up"   }
 *   503 { status: "degraded", db: "down" }
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let db: "up" | "down" = "down";

  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch (cause) {
    logger.error("health", "database check failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const warnings = productionWarnings();
  if (warnings.length > 0) {
    logger.warn("health", "configuration warnings", { warnings });
  }

  return NextResponse.json(
    {
      status: db === "up" ? "ok" : "degraded",
      db,
      latencyMs: Date.now() - startedAt,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { status: db === "up" ? 200 : 503 }
  );
}
