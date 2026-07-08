"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createUserAction, type CreateUserState } from "@/actions/user-management.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ALL_ROLES } from "@/lib/constants/enums";

const initialState: CreateUserState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

function AddEmployeeDialogBody({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);

  if (state.created) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Account created for{" "}
          <span className="font-medium">{state.created.fullName}</span>. Share
          these sign-in details securely — the temporary password won&apos;t
          be shown again.
        </p>
        <div className="space-y-1.5 rounded-lg border bg-muted p-3 font-mono text-sm">
          <p>{state.created.email}</p>
          <p>{state.created.tempPassword}</p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select name="role" defaultValue="EMPLOYEE" disabled={pending}>
          <SelectTrigger id="role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="employeeCode">Employee ID (optional)</Label>
          <Input id="employeeCode" name="employeeCode" disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactNumber">Contact number (optional)</Label>
          <Input id="contactNumber" name="contactNumber" disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address (optional)</Label>
        <Input id="address" name="address" disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pickupPoint">Pick-up point (optional)</Label>
        <Input id="pickupPoint" name="pickupPoint" disabled={pending} />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <DialogFooter>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

export function AddEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setResetKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">Add employee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user manually</DialogTitle>
        </DialogHeader>
        <AddEmployeeDialogBody key={resetKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
