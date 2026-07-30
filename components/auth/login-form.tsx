"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginActionState } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="mx-auto block w-auto min-w-32 bg-[#aef2ff] px-8 text-[#001014] hover:bg-[#d3f8ff]"
      disabled={pending}
    >
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">8+ characters. Case-sensitive.</p>
          <Link
            href="/forgot-password"
            className="shrink-0 text-xs font-medium underline underline-offset-4"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="rememberMe" name="rememberMe" />
        <Label htmlFor="rememberMe" className="text-sm font-normal text-muted-foreground">
          Keep me signed in on this device
        </Label>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="pt-1">
        <SubmitButton />
      </div>
    </form>
  );
}
