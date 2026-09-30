import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import type { Role } from "@/lib/constants/enums";

export type SessionTokenPayload = {
  sub: string; // userId
  role: Role;
  mustChangePassword: boolean;
  jti: string; // matches Session.sessionToken in the DB, for revocation
};

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
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.mustChangePassword !== "boolean" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    return payload as unknown as SessionTokenPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_DURATION_SECONDS;
export const SESSION_COOKIE_NAME = "session";
