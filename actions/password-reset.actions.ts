"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { sendMail } from "@/lib/mailer";
import { writeAuditLog } from "@/lib/audit/log";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/schemas";
import { AuditActionType } from "@/lib/constants/enums";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export type RequestPasswordResetState = {
  error?: string;
  success?: boolean;
};

export async function requestPasswordResetAction(
  _prevState: RequestPasswordResetState,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Always report success, whether or not the account exists, to avoid
  // leaking which emails have accounts.
  if (user && user.isActive) {
    const token = randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const headerList = await headers();
    const host = headerList.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const resetUrl = `${protocol}://${host}/reset-password/${token}`;

    await sendMail({
      to: user.email,
      subject: "Reset your Transportation Portal password",
      body: `Hi ${user.fullName},\n\nUse the link below to reset your password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    });
  }

  return { success: true };
}

export type ResetPasswordState = {
  error?: string;
};

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await prisma.user.findUnique({
    where: { passwordResetToken: parsed.data.token },
  });

  if (
    !user ||
    !user.isActive ||
    !user.passwordResetExpires ||
    user.passwordResetExpires.getTime() < Date.now()
  ) {
    return { error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  await writeAuditLog({
    actor: { id: user.id, email: user.email, role: user.role },
    actionType: AuditActionType.PASSWORD_CHANGED,
    entityType: "User",
    entityId: user.id,
    description: `${user.fullName} reset their password via the forgot-password link`,
  });

  redirect("/login?reset=success");
}
