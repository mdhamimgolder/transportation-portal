import "server-only";

/**
 * Standardized server-action error handling.
 *
 * Rules:
 * - Every exported action must call `requireAuth` / `requireRole` FIRST,
 *   outside any try-catch, so Next.js `redirect()` (which throws
 *   NEXT_REDIRECT) is never swallowed.
 * - All Prisma / unexpected errors inside the `try` body must go through
 *   these helpers: the raw error is logged internally and only a sanitized,
 *   user-friendly message is returned (or thrown) to the client.
 * - Intentional validation messages are returned directly via early
 *   `return { error: "..." }` — never via `catch`. The `catch` path is only
 *   for unexpected failures and always resolves to the generic message
 *   (plus a friendly P2002 mapping that reveals no column internals
 *   beyond "already exists").
 */

export const GENERIC_ACTION_ERROR =
  "An unexpected error occurred while processing your request.";

/** True for Next.js redirect() throws — these must always propagate. */
export function isRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as unknown) as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** Log the raw error internally (server logs only — never sent to client). */
export function logActionError(action: string, error: unknown): void {
  console.error(`[${action}]`, error);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/**
 * For actions returning `{ error?: string }` shapes.
 * Rethrows redirects; logs raw error; returns a sanitized object.
 */
export function sanitizedActionError(
  action: string,
  error: unknown,
  fallback: string = GENERIC_ACTION_ERROR
): { error: string } {
  if (isRedirectError(error)) throw error;
  logActionError(action, error);
  if (isUniqueConstraintError(error)) {
    return { error: "A record with that value already exists." };
  }
  return { error: fallback };
}

/** Same as above but returns just the sanitized message string. */
export function sanitizedActionMessage(
  action: string,
  error: unknown,
  fallback: string = GENERIC_ACTION_ERROR
): string {
  return sanitizedActionError(action, error, fallback).error;
}

/**
 * For actions that `throw` (data loaders).
 * Rethrows redirects; logs raw error; throws a sanitized generic Error.
 */
export function throwSanitizedError(
  action: string,
  error: unknown,
  fallback: string = GENERIC_ACTION_ERROR
): never {
  if (isRedirectError(error)) throw error;
  logActionError(action, error);
  throw new Error(fallback);
}
