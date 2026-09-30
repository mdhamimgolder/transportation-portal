import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";

const KEEP_ALIVE_INTERVAL_MS = 60_000;
const KEEP_ALIVE_FLAG = "__neonKeepAliveStarted";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // Batch transactions (e.g. re-timing a whole route, week-mirroring all
    // sibling days) routinely exceed Prisma's 5 s default timeout once a route
    // has many stops — raise it so multi-row writes never expire mid-commit.
    transactionOptions: {
      maxWait: 30000,
      timeout: 90000,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  startDevKeepAlive();
}

/**
 * Dev-only: Neon free-tier computes auto-suspend after ~5 min idle, and the
 * wake-up stalls the first query afterwards for tens of seconds (observed
 * 60-103s page loads in next-dev.log). A light SELECT 1 every 60s keeps the
 * compute warm while `next dev` runs. Production sees real traffic so it never
 * idles — no ping there. A module-level global guard keeps HMR re-evals from
 * stacking duplicate timers in one process.
 */
function startDevKeepAlive(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[KEEP_ALIVE_FLAG]) return;
  g[KEEP_ALIVE_FLAG] = true;

  const ping = () => {
    prisma.$queryRaw`SELECT 1`.catch(() => {
      // Neon websocket blips are expected (see lib/db/retry.ts); the next tick
      // retries.
    });
  };
  void ping();
  const timer = setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
  timer.unref?.();
}