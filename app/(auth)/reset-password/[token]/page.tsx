import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
  const isValid =
    !!user &&
    user.isActive &&
    !!user.passwordResetExpires &&
    user.passwordResetExpires.getTime() > Date.now();

  if (!isValid) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
            Link invalid or expired
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This password reset link is no longer valid. Request a new one to
            continue.
          </p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/forgot-password" className="underline underline-offset-4">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choose a new password for your account.
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
