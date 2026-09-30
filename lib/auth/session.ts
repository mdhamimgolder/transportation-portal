import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db/retry";
import { env } from "@/lib/env";
import {
  signSessionToken,
  verifySessionToken,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/jwt";
import type { Role } from "@/lib/constants/enums";

export { SESSION_COOKIE_NAME };

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
};

type UserForSession = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
};

/**
 * Sweeps expired Session rows. There's no cron/scheduler in this app, so
 * this piggybacks on every login instead -- cheap (indexed on expiresAt)
 * and keeps the table from growing unbounded over months/years of logins.
 */
async function deleteExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export async function createSession(user: UserForSession): Promise<void> {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      sessionToken: jti,
      expiresAt,
    },
  });

  void deleteExpiredSessions();

  const token = await signSessionToken({
    sub: user.id,
    role: user.role as Role,
    mustChangePassword: user.mustChangePassword,
    jti,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Authoritative session check for use in Server Components/Actions (Node runtime).
 * Re-verifies the JWT AND confirms the underlying Session row + User are still
 * valid in the database -- middleware only checks the JWT, so this is the final
 * word on whether a session is actually still good (covers revocation/deactivation).
 *
 * Memoized per request with React `cache()`: layouts and pages each call
 * requireRole → getSession, and with a slow Neon connection each extra lookup
 * costs seconds. The cookie can't change within one request, so memoizing is
 * safe and collapses those lookups to a single DB round trip.
 */
export const getSession = cache(
  async (): Promise<SessionUser | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifySessionToken(token);
    if (!payload) return null;

    // The JWT proves the bearer, but the Session row is what revocation /
    // deactivation updates, so this DB lookup runs on every guarded page and
    // action. It was the last unguarded read in the request path —
    // withDbRetry absorbs Neon websocket blips so a blip surfaces as a readable
    // error instead of an opaque `[object ErrorEvent]` 500.
    const session = await withDbRetry("session", () =>
      prisma.session.findUnique({
        where: { sessionToken: payload.jti },
        include: { user: true },
      })
    );

    if (!session || session.expiresAt < new Date()) return null;
    if (!session.user.isActive) return null;

    return {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role as Role,
      mustChangePassword: session.user.mustChangePassword,
    };
  }
);

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      await prisma.session
        .delete({ where: { sessionToken: payload.jti } })
        .catch(() => {
          // session row may already be gone; logout should succeed regardless
        });
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Rotates the session cookie/DB row for a user whose mustChangePassword or role
 * just changed, so the JWT's stale claims don't linger until natural expiry.
 */
export async function rotateSession(user: UserForSession): Promise<void> {
  await destroySession();
  await createSession(user);
}
