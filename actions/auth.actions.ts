"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordAgainstDummy,
} from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  revokeUserSessions,
  rotateSession,
} from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import {
  RATE_LIMITS,
  clientIp,
  consumeRateLimit,
  resetRateLimit,
} from "@/lib/rate-limit";
import { requireAuth } from "@/lib/rbac/guards";
import { sanitizedActionError } from "@/lib/actions/action-error";
import {
  loginSchema,
  changePasswordSchema,
  selfChangePasswordSchema,
} from "@/lib/validation/schemas";
import { ROLE_HOME, type Role } from "@/lib/constants/enums";

export type LoginActionState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password } = parsed.data;

  // Public entry point (login) — intentionally no requireAuth/requireRole.
  try {
    const normalizedEmail = email.toLowerCase();
    const [ipAllowed, emailAllowed] = await Promise.all([
      consumeRateLimit(RATE_LIMITS.loginByIp, await clientIp()),
      consumeRateLimit(RATE_LIMITS.loginByEmail, normalizedEmail),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      omit: { passwordHash: false },
    });

    if (!user || !user.isActive) {
      // Burn the same bcrypt time as a real check so response timing doesn't
      // reveal which emails have accounts.
      await verifyPasswordAgainstDummy(password);
      return { error: "Invalid email or password" };
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      return { error: "Invalid email or password" };
    }

    await resetRateLimit(RATE_LIMITS.loginByEmail, normalizedEmail);
    await createSession(user);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const destination = user.mustChangePassword
      ? "/force-change-password"
      : ROLE_HOME[user.role as Role];

    redirect(destination);
  } catch (error) {
    return sanitizedActionError("loginAction", error);
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export type ChangePasswordActionState = {
  error?: string;
};

export async function changePasswordAction(
  _prevState: ChangePasswordActionState,
  formData: FormData
): Promise<ChangePasswordActionState> {
  const session = await requireAuth();

  const parsed = changePasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const passwordHash = await hashPassword(parsed.data.newPassword);

    const user = await prisma.user.update({
      where: { id: session.id },
      data: { passwordHash, mustChangePassword: false },
    });

    await revokeUserSessions(user.id);
    await rotateSession(user);
    await audit(session, {
      action: "CHANGE_PASSWORD",
      entityType: "User",
      entityId: user.id,
      description: `${user.fullName} replaced their temporary password`,
    });

    redirect(ROLE_HOME[user.role as Role]);
  } catch (error) {
    return sanitizedActionError("changePasswordAction", error);
  }
}

export type SelfChangePasswordState = {
  error?: string;
  success?: boolean;
};

export async function selfChangePasswordAction(
  _prevState: SelfChangePasswordState,
  formData: FormData
): Promise<SelfChangePasswordState> {
  const session = await requireAuth();

  const parsed = selfChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.id },
      omit: { passwordHash: false },
    });

    const currentMatches = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash
    );
    if (!currentMatches) {
      return { error: "Current password is incorrect." };
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    // Sign out every other device; the current one gets a fresh session.
    await revokeUserSessions(user.id);
    await rotateSession(updated);
    await audit(session, {
      action: "CHANGE_PASSWORD",
      entityType: "User",
      entityId: user.id,
      description: `${user.fullName} changed their password`,
    });

    return { success: true };
  } catch (error) {
    return sanitizedActionError("selfChangePasswordAction", error);
  }
}
