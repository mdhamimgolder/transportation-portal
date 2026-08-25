"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateEmployeeProfileByFacilitiesAction,
  type UpdateEmployeeProfileState,
} from "@/actions/facilities-profile.actions";
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

const initialState: UpdateEmployeeProfileState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

export function EditEmployeeProfileDialog({
  userId,
  fullName,
  contactNumber,
  address,
  pickupPoint,
}: {
  userId: string;
  fullName: string;
  contactNumber: string | null;
  address: string | null;
  pickupPoint: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    updateEmployeeProfileByFacilitiesAction,
    initialState
  );

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {fullName}&apos;s profile</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-2">
            <Label htmlFor={`contactNumber-${userId}`}>Contact number</Label>
            <Input
              id={`contactNumber-${userId}`}
              name="contactNumber"
              defaultValue={contactNumber ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`address-${userId}`}>Address</Label>
            <Input
              id={`address-${userId}`}
              name="address"
              defaultValue={address ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pickupPoint-${userId}`}>Pick-up point</Label>
            <Input
              id={`pickupPoint-${userId}`}
              name="pickupPoint"
              defaultValue={pickupPoint ?? ""}
              required
            />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
