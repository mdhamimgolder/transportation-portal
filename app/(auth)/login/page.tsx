import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/constants/enums";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(
      session.mustChangePassword ? "/force-change-password" : ROLE_HOME[session.role]
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Use your work email to access the portal.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
