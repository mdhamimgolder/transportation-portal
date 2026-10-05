import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const KEEP_ALIVE_INTERVAL_MS = 60_000;
const KEEP_ALIVE_FLAG = "__neonKeepAliveStarted";

/**
 * Credential columns are omitted from EVERY query by default (including nested
 * `include: { employee: true }` relations), so a password hash or a live reset
 * token can never be serialized into a client component or a Server Action
 * response by accident. The few auth paths that genuinely need them opt back
 * in per query with `omit: { passwordHash: false }`.
 */
const SENSITIVE_USER_FIELDS = {
  passwordHash: true,
  passwordResetToken: true,
  passwordResetExpires: true,
} as const;

function createClient() {
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    omit: { user: SENSITIVE_USER_FIELDS },
    // Batch transactions (e.g. re-timing a whole route, week-mirroring all
    // sibling days) routinely exceed Prisma's 5 s default timeout once a route
    // has many stops — raise it so multi-row writes never expire mid-commit.
    transactionOptions: {
      maxWait: 30000,
      timeout: 90000,
    },
  });
}

export type AppPrismaClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined;
};

let singleton: AppPrismaClient | null = null;

function getPrisma(): AppPrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (!singleton) {
    singleton = createClient();
    // Remember the real client across HMR re-evals (dev only — in production
    // the module is evaluated once, so the local singleton is enough).
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = singleton;
    }
  }
  return singleton;
}

/**
 * Prisma singleton. The client (and its Neon adapter) is created lazily on
 * first query — never at module import — so pages that never touch the DB
 * (and `next build` without secrets) don't validate env or open connections.
 *
 * Implementation note: the proxy forwards every property on first access via
 * `get`, so a fresh client is only constructed when one is actually used.
 * `Reflect.get` without a proxy receiver keeps getters and methods bound to
 * the REAL client — this matters for `prisma.$queryRaw`, which is a tagged
 * template calling `this`.
 */
const prismaHandler: ProxyHandler<AppPrismaClient> = {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(
      client as unknown as Record<PropertyKey, unknown>,
      property
    );
    return typeof value === "function"
      ? (value as (...args: never[]) => unknown).bind(client)
      : value;
  },
};

export const prisma = new Proxy({} as AppPrismaClient, prismaHandler);

if (process.env.NODE_ENV !== "production") {
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
    prisma.$queryRaw`SELECT 1`.catch((error: unknown) => {
      // Neon websocket blips are expected (see lib/db/retry.ts); the next tick
      // retries.
      logger.debug("prisma", "keep-alive ping failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };
  void ping();
  const timer = setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
  timer.unref?.();
}