"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { assignRoute, type AssignRouteState } from "@/actions/route-assignment.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VehicleDriverCombobox,
  type VehicleDriverOption,
} from "@/components/facilities/vehicle-driver-combobox";
import { PICKUP_TIME_OPTIONS } from "@/lib/constants/pickup-times";

const initialState: AssignRouteState = {};

export type { VehicleDriverOption };

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
  existingComment,
  pickupTimeMode = "select",
}: {
  target: { weeklyScheduleDayId: string } | { adHocRequestId: string };
  options: VehicleDriverOption[];
  existing?: ExistingAssignment;
  existingComment?: string | null;
  pickupTimeMode?: "select" | "text";
}) {
  const isAdHoc = "adHocRequestId" in target;
  const [editing, setEditing] = useState(!existing && !existingComment);
  const [state, formAction] = useActionState(assignRoute, initialState);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  if ((existing || existingComment) && !editing) {
    return (
      <div className="space-y-1.5 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {existing ? (
            <>
              <span className="font-medium">{existing.driverName}</span>
              <span className="text-muted-foreground">{existing.vehicleNumber}</span>
              <span className="text-muted-foreground">{existing.pickupTime}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No vehicle assigned yet.</span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        {existingComment ? (
          <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
            Note to employee: {existingComment}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
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

      <VehicleDriverCombobox
        name="vehicleDriverId"
        options={options}
        defaultValue={existing?.vehicleDriverId}
        className="w-56"
      />

      {pickupTimeMode === "text" ? (
        <Input
          name="pickupTime"
          defaultValue={existing?.pickupTime}
          placeholder="e.g. 10:30 PM"
          className="w-32"
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

      {isAdHoc ? (
        <Textarea
          name="comment"
          defaultValue={existingComment ?? ""}
          placeholder="Note to employee (optional -- can be sent without an assignment)"
          className="w-64"
          rows={1}
        />
      ) : null}

      <SubmitButton />
      {existing || existingComment ? (
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
