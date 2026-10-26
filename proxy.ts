import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { ROLE_HOME, ROLE_PATH_PREFIX, Role } from "@/lib/constants/enums";

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/403",
];

/**
 * Prefixes a SUPER_ADMIN may enter in addition to the owning role. This must
 * mirror the layouts exactly, otherwise the edge gate and the DB-backed guard
 * disagree and a user gets bounced to /403 on a page they are allowed to see.
 * Facilities is the elevated area: app/facilities/layout.tsx accepts
 * [FACILITIES, SUPER_ADMIN] and so does every Facilities server action.
 */
const SUPER_ADMIN_EXTRA_PREFIXES = ["/facilities"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function requiredRoleForPath(pathname: string): Role | null {
  for (const [role, prefix] of Object.entries(ROLE_PATH_PREFIX)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return role as Role;
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Edge-only, JWT-signature-only check. This is the fast first pass; the
  // authoritative DB-backed check (session revocation, user still active)
  // happens in each role layout via lib/rbac/guards.ts (Node runtime -- Prisma
  // can't run on the Edge runtime).
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (pathname === "/force-change-password") {
    if (!payload) return NextResponse.redirect(new URL("/login", request.url));
    if (!payload.mustChangePassword) {
      return NextResponse.redirect(new URL(ROLE_HOME[payload.role], request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    // Note: we deliberately do NOT redirect away from /login here even if a
    // signed JWT is present. That check only verifies the cookie's signature,
    // not whether the underlying DB session is still valid -- if the two ever
    // disagree (session revoked, DB reset, user deactivated), an optimistic
    // redirect here would ping-pong forever against the authoritative
    // DB-backed check in the (auth) layout, which redirects back to /login.
    // The (auth) layout handles "already logged in" redirects instead, since
    // it can safely hit the database.
    return NextResponse.next();
  }

  const requiredRole = requiredRoleForPath(pathname);
  if (requiredRole) {
    if (!payload) return NextResponse.redirect(new URL("/login", request.url));
    if (payload.mustChangePassword) {
      return NextResponse.redirect(
        new URL("/force-change-password", request.url)
      );
    }
    if (payload.role !== requiredRole) {
      const requiredPrefix = ROLE_PATH_PREFIX[requiredRole];
      const isElevatedSuperAdmin =
        payload.role === Role.SUPER_ADMIN &&
        SUPER_ADMIN_EXTRA_PREFIXES.includes(requiredPrefix);
      if (!isElevatedSuperAdmin) {
        return NextResponse.redirect(new URL("/403", request.url));
      }
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/time).*)"],
};
