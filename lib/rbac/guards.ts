import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { Role } from "@/lib/constants/enums";

/**
 * Roles Facilities may administer day-to-day on the User Info page
 * (edit profile, set password, resend/delete). Role CHANGES are broader:
 * see `updateUserRoleByFacilitiesAction` — Facilities may also change the
 * role of staff accounts, but never touch or grant SUPER_ADMIN.
 */
export const FACILITIES_MANAGEABLE_ROLES: readonly string[] = [
  Role.EMPLOYEE,
  Role.CORPORATE_EMPLOYEE,
  Role.FIXED_ARRIVAL,
];

export function canFacilitiesManage(targetRole: string): boolean {
  return FACILITIES_MANAGEABLE_ROLES.includes(targetRole);
}

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
 * DB-backed check that runs alongside the faster JWT-only check in proxy.ts.
 */
export async function requireRole(allowedRoles: Role[]): Promise<SessionUser> {
  const session = await requireAuth();
  // A temporary password must be replaced before ANY role capability is
  // used. The proxy enforces this for page navigation; this covers Server
  // Actions, which can be POSTed from any path.
  if (session.mustChangePassword) {
    redirect("/force-change-password");
  }
  if (!allowedRoles.includes(session.role)) {
    redirect("/403");
  }
  return session;
}
