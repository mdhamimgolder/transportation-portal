"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  resendCredentialsAction,
  type ResendCredentialsState,
} from "@/actions/user-management.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: ResendCredentialsState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send new credentials"}
    </Button>
  );
}

export function ResendCredentialsDialog({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const [state, formAction] = useActionState(
    resendCredentialsAction,
    initialState
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Resend credentials
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resend credentials — {fullName}</DialogTitle>
          <DialogDescription>
            Generates a fresh temporary password (the original one cannot be
            recovered), emails it, and forces a password change on next login.
          </DialogDescription>
        </DialogHeader>
        {state.result ? (
          <div className="space-y-3">
            {state.result.status === "failed" ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Email failed to send to{" "}
                  <span className="font-mono">{state.result.email}</span>
                </p>
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  {state.result.error ?? "Unknown SMTP error."}
                </p>
                <p className="text-xs text-muted-foreground">
                  The password was still reset — fix the mail settings, then
                  resend again.
                </p>
              </div>
            ) : (
              <p className="text-sm text-foreground">
                {state.result.status === "sent"
                  ? "Credentials email sent to "
                  : "Dev mode — email skipped (would send to "}
                <span className="font-mono">{state.result.email}</span>
                {state.result.status === "sent" ? "." : ")."} A new temporary
                password is active and must be changed at next login.
              </p>
            )}
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="userId" value={userId} />
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            <DialogFooter>
              <SubmitButton />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}