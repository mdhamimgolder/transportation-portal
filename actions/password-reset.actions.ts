"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { auditEntry } from "@/lib/audit";
import {
  RESET_TOKEN_TTL_LABEL,
  RESET_TOKEN_TTL_MS,
  createResetToken,
  hashResetToken,
} from "@/lib/auth/reset-token";
import { appBaseUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMailBackground } from "@/lib/mailer";
import { RATE_LIMITS, clientIp, consumeRateLimit } from "@/lib/rate-limit";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/schemas";
import { sanitizedActionError } from "@/lib/actions/action-error";

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

  // Public entry point — intentionally no requireAuth/requireRole.
  try {
    const email = parsed.data.email.toLowerCase();

    const [ipAllowed, emailAllowed] = await Promise.all([
      consumeRateLimit(RATE_LIMITS.resetRequestByIp, await clientIp()),
      consumeRateLimit(RATE_LIMITS.resetRequestByEmail, email),
    ]);
    if (!ipAllowed) {
      return { error: "Too many reset requests. Please try again later." };
    }
    // Over the per-email limit: report the same generic success so the
    // response never reveals whether the account exists — just don't send.
    if (!emailAllowed) return { success: true };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, isActive: true },
    });

    // Always report success, whether or not the account exists, to avoid
    // leaking which emails have accounts.
    if (user && user.isActive) {
      const baseUrl = appBaseUrl();
      if (!baseUrl) {
        logger.error("password-reset", "APP_URL is not configured; reset email not sent");
        return { success: true };
      }

      const { token, tokenHash } = createResetToken();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: tokenHash,
          passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      const resetUrl = `${baseUrl}/reset-password/${token}`;

      after(async () => {
        await sendMailBackground({
          to: user.email,
          subject: "Reset your Transportation Portal password",
          body: `Hi ${user.fullName},

Use the link below to reset your password. This link expires in ${RESET_TOKEN_TTL_LABEL} and can be used once.

${resetUrl}

If you didn't request this, you can ignore this email.`,
        });
      });
    }

    return { success: true };
  } catch (error) {
    return sanitizedActionError("requestPasswordResetAction", error);
  }
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

  // Public entry point — intentionally no requireAuth/requireRole.
  try {
    if (!(await consumeRateLimit(RATE_LIMITS.resetSubmitByIp, await clientIp()))) {
      return { error: "Too many attempts. Please try again later." };
    }

    const tokenHash = hashResetToken(parsed.data.token);
    const user = await prisma.user.findUnique({
      where: { passwordResetToken: tokenHash },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return { error: "This reset link is invalid or has expired." };
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    // Consume the token atomically: the WHERE re-checks the hash + expiry, so
    // two concurrent submissions of the same link can't both succeed.
    const consumed = await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordResetToken: tokenHash,
          passwordResetExpires: { gt: new Date() },
        },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });
      if (result.count !== 1) return false;

      await tx.session.deleteMany({ where: { userId: user.id } });
      await auditEntry(
        { id: user.id, role: user.role },
        {
          action: "RESET_PASSWORD",
          entityType: "User",
          entityId: user.id,
          description: "User reset their password via an emailed link",
        },
        tx
      );
      return true;
    });
    if (!consumed) {
      return { error: "This reset link is invalid or has expired." };
    }

    redirect("/login?reset=success");
  } catch (error) {
    return sanitizedActionError("resetPasswordAction", error);
  }
}
