import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button, Field, Input } from "@/components/ui";
import { useAuth, roleHome } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { apiError } from "@/api/client";

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast(`Welcome back, ${user.name.split(" ")[0]}!`, "success");
      navigate(roleHome[user.role], { replace: true });
    } catch (err) {
      toast(apiError(err, "Login failed."), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Enter your credentials to access the portal.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoFocus
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="link text-sm">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link to="/register" className="link font-medium">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
