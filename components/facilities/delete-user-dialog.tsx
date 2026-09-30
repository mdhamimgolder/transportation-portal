"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteUserAction,
  type DeleteUserState,
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

const initialState: DeleteUserState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting…" : "Delete permanently"}
    </Button>
  );
}

export function DeleteUserDialog({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const [state, formAction] = useActionState(deleteUserAction, initialState);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {fullName}?</DialogTitle>
          <DialogDescription>
            This permanently removes the user and ALL of their data — weekly
            schedules, trip assignments, ad-hoc requests, change requests, and
            login sessions. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {state.success ? (
          <p className="text-sm text-foreground">User deleted.</p>
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
