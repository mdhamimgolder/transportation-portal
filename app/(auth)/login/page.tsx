import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/constants/enums";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect(
      session.mustChangePassword ? "/force-change-password" : ROLE_HOME[session.role]
    );
  }

  const { reset } = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Sign in to your account
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Use your work email to access schedules and fleet assignments.
        </p>
      </div>
      {reset === "success" ? (
        <p className="mb-4 rounded-lg border border-green-foreground/20 bg-green-foreground/10 px-3 py-2 text-sm text-green-foreground">
          Your password has been reset. Sign in with your new password.
        </p>
      ) : null}
      <LoginForm />
    </div>
  );
}
