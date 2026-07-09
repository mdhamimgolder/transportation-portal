"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { assignRoute, type AssignRouteState } from "@/actions/route-assignment.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PICKUP_TIME_OPTIONS } from "@/lib/constants/pickup-times";

const initialState: AssignRouteState = {};

export type VehicleDriverOption = {
  id: string;
  driverName: string;
  vehicleNumber: string;
  vendor: string;
};

export type ExistingAssignment = {
  vehicleDriverId: string;
  driverName: string;
  vehicleNumber: string;
  pickupTime: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}

export function AssignmentForm({
  target,
  options,
  existing,
  pickupTimeMode = "select",
}: {
  target: { weeklyScheduleDayId: string } | { adHocRequestId: string };
  options: VehicleDriverOption[];
  existing?: ExistingAssignment;
  pickupTimeMode?: "select" | "text";
}) {
  const [editing, setEditing] = useState(!existing);
  const [state, formAction] = useActionState(assignRoute, initialState);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  if (existing && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{existing.driverName}</span>
        <span className="text-muted-foreground">{existing.vehicleNumber}</span>
        <span className="text-muted-foreground">{existing.pickupTime}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {"weeklyScheduleDayId" in target ? (
        <input
          type="hidden"
          name="weeklyScheduleDayId"
          value={target.weeklyScheduleDayId}
        />
      ) : (
        <input
          type="hidden"
          name="adHocRequestId"
          value={target.adHocRequestId}
        />
      )}

      <Select name="vehicleDriverId" defaultValue={existing?.vehicleDriverId}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Vehicle & driver" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.driverName} &middot; {option.vehicleNumber} ({option.vendor})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pickupTimeMode === "text" ? (
        <Input
          name="pickupTime"
          defaultValue={existing?.pickupTime}
          placeholder="e.g. 10:30 PM"
          className="w-32"
          required
        />
      ) : (
        <Select name="pickupTime" defaultValue={existing?.pickupTime}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Time" />
          </SelectTrigger>
          <SelectContent>
            {PICKUP_TIME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <SubmitButton />
      {existing ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      ) : null}
      {state.error ? (
        <p className="w-full text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
