"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateProfile,
  type UpdateProfileState,
} from "@/actions/profile.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: UpdateProfileState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

export function ProfileUpdateForm({
  pickupPoint,
  address,
  contactNumber,
}: {
  pickupPoint: string | null;
  address: string | null;
  contactNumber: string | null;
}) {
  const [state, formAction] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pickupPoint">Pick-up Point</Label>
        <Input
          id="pickupPoint"
          name="pickupPoint"
          defaultValue={pickupPoint ?? ""}
          placeholder="e.g. Gulshan 1 Circle"
          disabled
        />
        <p className="text-xs text-muted-foreground">
          Your pick-up point is managed by Facilities.
        </p>
        {state.errors?.pickupPoint ? (
          <p className="text-sm text-destructive">{state.errors.pickupPoint}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          name="address"
          defaultValue={address ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Your address updates immediately. You can change it again after 30 days.
        </p>
        {state.errors?.address ? (
          <p className="text-sm text-destructive">{state.errors.address}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactNumber">Contact Number</Label>
        <Input
          id="contactNumber"
          name="contactNumber"
          defaultValue={contactNumber ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Your contact number updates immediately.
        </p>
        {state.errors?.contactNumber ? (
          <p className="text-sm text-destructive">{state.errors.contactNumber}</p>
        ) : null}
      </div>

      {state.successMessages && state.successMessages.length > 0 ? (
        <div className="space-y-1">
          {state.successMessages.map((message) => (
            <p key={message} className="text-sm text-green-foreground">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
