import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "@/lib/env";
import { ALL_ROLES, type Role } from "@/lib/constants/enums";

export type SessionTokenPayload = {
  sub: string; // userId
  role: Role;
  mustChangePassword: boolean;
  jti: string; // matches Session.sessionToken in the DB, for revocation
};

/** Runtime shape check — the role must be a real role, not just any string. */
const sessionTokenSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ALL_ROLES as [Role, ...Role[]]),
  mustChangePassword: z.boolean(),
  jti: z.string().min(1),
});

function getSecretKey() {
  const secret = env.SESSION_SECRET;
  return new TextEncoder().encode(secret);
}

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function signSessionToken(
  payload: SessionTokenPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionTokenPayload | null> {
  try {
    // Pin the algorithm so a token signed any other way is rejected.
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const parsed = sessionTokenSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_DURATION_SECONDS;
export const SESSION_COOKIE_NAME = "session";
