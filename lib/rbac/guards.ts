import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth/session";
import type { Role } from "@/lib/constants/enums";

/**
 * Use at the top of a Server Component (layout/page) or Server Action to
 * require a logged-in session. Redirects to /login if there isn't one.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Requires an authenticated session AND that its role is in `allowedRoles`.
 * Redirects to /403 if the role doesn't match -- this is the authoritative,
 * DB-backed check that runs alongside the faster JWT-only check in middleware.ts.
 */
export async function requireRole(allowedRoles: Role[]): Promise<SessionUser> {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.role)) {
    redirect("/403");
  }
  return session;
}
