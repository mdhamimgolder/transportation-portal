import "server-only";
import { z } from "zod";

/**
 * Single source of truth for environment configuration.
 *
 * Parsed lazily — each property reads `process.env` only when actually touched —
 * so importing this module (or a module that imports it) never throws at build
 * time. A page that renders without a DB or SMTP config only fails when it
 * really needs that value, and the error names the missing variable.
 *
 * Only the two variables the app genuinely cannot run without are required;
 * everything else has a working default (public OSRM/Nominatim servers, Gmail
 * SMTP host, etc.). Production gaps in the optional-but-important set (SMTP)
 * are reported by `productionWarnings()` — used by /api/health — rather than
 * thrown, so a mail misconfiguration can never take the portal down.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Required -----------------------------------------------------------------
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (pooled Neon/Postgres connection string)"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET is required and must be at least 16 characters"),

  // Schema CLI only (Prisma Migrate needs the un-pooled connection) ----------
  DIRECT_URL: z.string().optional(),

  // Email --------------------------------------------------------------------
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Routing / geocoding ------------------------------------------------------
  OSRM_SERVER_URL: z.string().url().default("https://router.project-osrm.org"),
  GEOCODER_URL: z
    .string()
    .url()
    .default("https://nominatim.openstreetmap.org"),
  GEOCODER_USER_AGENT: z
    .string()
    .default("transportation-portal/1.0 (route planning)"),
  GEOCODER_COUNTRY_CODES: z.string().default("bd"),

  // Notifications ------------------------------------------------------------
  FACILITIES_NOTIFICATION_EMAIL: z.string().email().optional(),
  OPERATIONS_NOTIFICATION_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

type EnvKey = keyof Env;

const REQUIRED_KEYS: readonly EnvKey[] = ["DATABASE_URL", "SESSION_SECRET"];

/**
 * Read and validate a single key. Defaults declared in the schema are applied
 * per-key, so touching `OSRM_SERVER_URL` never requires `DATABASE_URL` (or any
 * other key) to be set — it just falls back to its default.
 */
function readKey<K extends EnvKey>(key: K): Env[K] {
  const field = envSchema.shape[key] as z.ZodTypeAny;
  const parsed = field.safeParse(process.env[key]);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n` +
        `  • ${key}: ${parsed.error.issues[0]?.message ?? "invalid value"}\n\n` +
        "Local: copy .env.example to .env.local and fill it in.\n" +
        "Vercel: Project → Settings → Environment Variables (see docs/RUNBOOK.md)."
    );
  }
  return parsed.data as Env[K];
}

/**
 * Lazily-read, typed environment. Each property validates only itself against
 * its schema rule on first access and is then cached — importing this module
 * never touches `process.env`, so `next build` stays green on machines that
 * lack runtime secrets.
 */
export const env = new Proxy({} as Env, {
  get(_target, property: string | symbol) {
    if (typeof property === "symbol") return undefined;
    return readKey(property as EnvKey);
  },
  has(_target, property: string | symbol) {
    return typeof property === "string" && property in envSchema.shape;
  },
});

export const isProduction = () => env.NODE_ENV === "production";

/**
 * Non-fatal configuration gaps worth surfacing in production. Used by
 * /api/health so a misconfigured deployment is visible without breaking.
 */
export function productionWarnings(): string[] {
  const warnings: string[] = [];
  const raw = process.env;

  for (const key of REQUIRED_KEYS) {
    if (!raw[key]) warnings.push(`${key} is not set`);
  }

  if (raw.NODE_ENV === "production") {
    if (!raw.SMTP_USER || !raw.SMTP_PASS) {
      warnings.push("SMTP_USER/SMTP_PASS are not set — outgoing email is disabled");
    }
    if (!raw.DIRECT_URL) {
      warnings.push(
        "DIRECT_URL is not set — Prisma Migrate will fall back to the pooled DATABASE_URL"
      );
    }
  }

  return warnings;
}
