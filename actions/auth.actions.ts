"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  getSession,
  rotateSession,
} from "@/lib/auth/session";
import { requireAuth } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import {
  loginSchema,
  changePasswordSchema,
  selfChangePasswordSchema,
} from "@/lib/validation/schemas";
import { AuditActionType, ROLE_HOME, type Role } from "@/lib/constants/enums";

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

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive) {
    return { error: "Invalid email or password" };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return { error: "Invalid email or password" };
  }

  await createSession(user);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await writeAuditLog({
    actor: { id: user.id, email: user.email, role: user.role },
    actionType: AuditActionType.USER_LOGIN,
    entityType: "User",
    entityId: user.id,
    description: `${user.fullName} logged in`,
  });

  const destination = user.mustChangePassword
    ? "/force-change-password"
    : ROLE_HOME[user.role as Role];

  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await writeAuditLog({
      actor: { id: session.id, email: session.email, role: session.role },
      actionType: AuditActionType.USER_LOGOUT,
      entityType: "User",
      entityId: session.id,
      description: `${session.fullName} logged out`,
    });
  }
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

  const passwordHash = await hashPassword(parsed.data.newPassword);

  const user = await prisma.user.update({
    where: { id: session.id },
    data: { passwordHash, mustChangePassword: false },
  });

  await rotateSession(user);
  await writeAuditLog({
    actor: { id: user.id, email: user.email, role: user.role },
    actionType: AuditActionType.PASSWORD_CHANGED,
    entityType: "User",
    entityId: user.id,
    description: `${user.fullName} changed their password`,
  });

  redirect(ROLE_HOME[user.role as Role]);
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

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });

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

  await rotateSession(updated);
  await writeAuditLog({
    actor: { id: updated.id, email: updated.email, role: updated.role },
    actionType: AuditActionType.PASSWORD_CHANGED,
    entityType: "User",
    entityId: updated.id,
    description: `${updated.fullName} changed their own password from their profile`,
  });

  return { success: true };
}
