import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A valid hash of a random value, computed once. Comparing against it costs the
// same as a real check, so "unknown email" and "wrong password" take equal time.
let dummyHash: Promise<string> | null = null;

export async function verifyPasswordAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash(crypto.randomUUID(), SALT_ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
}

/**
 * Password policy (spec): at least 8 characters, one uppercase letter and one
 * number. Returns an error message, or null when the password is acceptable.
 */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  return null;
}
