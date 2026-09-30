import "server-only";

/**
 * Tiny structured logger. In production it emits one JSON object per line (so
 * Vercel/host log search can filter by `level` or `event`); in development it
 * stays human-readable. No dependency, no transports to configure.
 *
 *   logger.warn("mailer", "email skipped", { to, subject });
 *
 * Reads `process.env` directly (never the validated `env` module) on purpose:
 * the logger is used inside request paths that `lib/env.ts` also serves, so it
 * must stay dependency-free of env validation.
 */
type Level = "debug" | "info" | "warn" | "error";

type Meta = Record<string, unknown>;

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = ((): Level => {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error"
    ? raw
    : process.env.NODE_ENV === "production"
      ? "info"
      : "debug";
})();

const isProduction = process.env.NODE_ENV === "production";

function emit(level: Level, scope: string, message: string, meta?: Meta): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configuredLevel]) return;

  const payload = { level, scope, message, ...(meta ?? {}) };

  if (isProduction) {
    const line = JSON.stringify({ ...payload, ts: new Date().toISOString() });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }

  const prefix = `[${level.toUpperCase()}] ${scope}:`;
  const args = meta ? [prefix, message, meta] : [prefix, message];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
}

export const logger = {
  debug: (scope: string, message: string, meta?: Meta) =>
    emit("debug", scope, message, meta),
  info: (scope: string, message: string, meta?: Meta) =>
    emit("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Meta) =>
    emit("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Meta) =>
    emit("error", scope, message, meta),
};
