import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button, Field, Input } from "@/components/ui";
import { authApi } from "@/api/endpoints";
import { useToast } from "@/context/ToastContext";
import { apiError } from "@/api/client";

export default function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.forgot(email);
      setSent(true);
      toast(res.detail, "info");
    } catch (err) {
      toast(apiError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="We'll email you a reset link if the account exists."
    >
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-cyan/40 bg-cyan/10 p-4 text-sm text-cyan">
            If an account exists for <b>{email}</b>, a reset link is on its way. In dev, check the
            backend console for the link.
          </p>
          <Link to="/login" className="link text-sm">
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            Send reset link
          </Button>
          <Link to="/login" className="link block text-center text-sm">
            ← Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
