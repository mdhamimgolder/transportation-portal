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
import { ALL_ROLES, OFFICE_LOCATIONS, ROLE_LABELS, type Role } from "@/lib/constants/enums";

/** TEST MODE (local only): relax the email/contact browser validation in dev —
 * mirrors the server-side checks in createUserAction. */
const IS_PROD = process.env.NODE_ENV === "production";

const initialState: CreateUserState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

function AddEmployeeDialogBody({ onDone, availableRoles }: { onDone: () => void; availableRoles: Role[] }) {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);

  if (state.created) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Account created for{" "}
          <span className="font-medium">{state.created.fullName}</span>{" "}
          (<span className="font-mono">{state.created.email}</span>). They can
          sign in now with the password you set.
        </p>
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
        <Input
          id="email"
          name="email"
          type={IS_PROD ? "email" : "text"}
          placeholder="name@commure.com"
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select name="role" defaultValue={availableRoles[0]} disabled={pending}>
          <SelectTrigger id="role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="employeeCode">Employee ID</Label>
          <Input
            id="employeeCode"
            name="employeeCode"
            placeholder="e.g. 123456789"
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Input id="department" name="department" required disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactNumber">Contact number</Label>
        <Input
          id="contactNumber"
          name="contactNumber"
          pattern={IS_PROD ? "\\d{11}" : undefined}
          title={IS_PROD ? "Must be exactly 11 digits" : undefined}
          placeholder="e.g. 01712345678"
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pickupPoint">Pick-up point</Label>
        <Input id="pickupPoint" name="pickupPoint" required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="officeLocation">Office location</Label>
        <Select name="officeLocation" required disabled={pending}>
          <SelectTrigger id="officeLocation" className="w-full">
            <SelectValue placeholder="Select office location" />
          </SelectTrigger>
          <SelectContent>
            {OFFICE_LOCATIONS.map((location) => (
              <SelectItem key={location} value={location}>
                {location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          disabled={pending}
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <DialogFooter>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

export function AddEmployeeDialog({ allowAllRoles = false }: { allowAllRoles?: boolean }) {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const availableRoles = allowAllRoles ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "SUPER_ADMIN");

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
        <AddEmployeeDialogBody key={resetKey} onDone={() => setOpen(false)} availableRoles={availableRoles} />
      </DialogContent>
    </Dialog>
  );
}
