import { ChangePasswordForm } from "@/components/auth/change-password-form";

export default function ForceChangePasswordPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your account was created with a temporary password. Choose a new
          password to continue.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
