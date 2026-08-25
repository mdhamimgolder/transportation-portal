import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { useAuth, roleHome } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { apiError } from "@/api/client";

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    contact_number: "",
    address: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function passwordValid(pw: string) {
    return pw.length >= 8 && /[A-Z]/.test(pw) && /\d/.test(pw);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordValid(form.password)) {
      toast("Password needs 8+ chars, 1 uppercase and 1 number.", "error");
      return;
    }
    setLoading(true);
    try {
      const user = await register(form);
      toast("Account created!", "success");
      navigate(roleHome[user.role], { replace: true });
    } catch (err) {
      toast(apiError(err, "Registration failed."), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Employees can self-register below.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <Input value={form.name} onChange={set("name")} required autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="Contact number">
          <Input value={form.contact_number} onChange={set("contact_number")} />
        </Field>
        <Field label="Address">
          <Textarea rows={2} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Password" error={form.password && !passwordValid(form.password) ? "8+ chars, 1 uppercase, 1 number" : undefined}>
          <Input type="password" value={form.password} onChange={set("password")} required />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className="link font-medium">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
