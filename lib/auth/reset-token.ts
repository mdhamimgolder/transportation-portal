import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Reset links are single-use and short-lived (spec: 30 minutes). */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const RESET_TOKEN_TTL_LABEL = "30 minutes";

/**
 * Only the SHA-256 of a reset token is stored, so a leaked DB row (or an
 * accidental serialization) can never be replayed as a working reset link.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh random token (sent to the user) and the hash to persist. */
export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token) };
}

/** True when the token belongs to an active user and has not expired. */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  const user = await prisma.user.findUnique({
    where: { passwordResetToken: hashResetToken(token) },
    select: { isActive: true, passwordResetExpires: true },
  });
  return (
    !!user &&
    user.isActive &&
    !!user.passwordResetExpires &&
    user.passwordResetExpires.getTime() > Date.now()
  );
}
