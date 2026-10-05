"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  setUserPasswordAction,
  type SetUserPasswordState,
} from "@/actions/user-management.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: SetUserPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Set password"}
    </Button>
  );
}

export function SetPasswordDialog({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(setUserPasswordAction, initialState);

  // Adjust state during render when a new action result arrives
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Set Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set password for {fullName}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-2">
            <Label htmlFor={`newPassword-${userId}`}>New password</Label>
            <Input
              id={`newPassword-${userId}`}
              name="newPassword"
              type="password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`confirmPassword-${userId}`}>Confirm password</Label>
            <Input
              id={`confirmPassword-${userId}`}
              name="confirmPassword"
              type="password"
              minLength={8}
              required
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
