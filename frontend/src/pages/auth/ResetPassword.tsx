import { FormEvent, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button, Field, Input } from "@/components/ui";
import { authApi } from "@/api/endpoints";
import { useToast } from "@/context/ToastContext";
import { apiError } from "@/api/client";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return toast("8+ chars, 1 uppercase, 1 number.", "error");
    if (password !== confirm) return toast("Passwords do not match.", "error");
    setLoading(true);
    try {
      await authApi.reset(token, password);
      toast("Password updated. Please sign in.", "success");
      navigate("/login", { replace: true });
    } catch (err) {
      toast(apiError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset password">
        <p className="text-sm text-danger">Missing or invalid reset link.</p>
        <Link to="/forgot-password" className="link mt-4 block text-sm">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password" error={password && !valid ? "8+ chars, 1 uppercase, 1 number" : undefined}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>
        <Field label="Confirm password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
