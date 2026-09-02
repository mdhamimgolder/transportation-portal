"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { assignRoute, type AssignRouteState } from "@/actions/route-assignment.actions";
import { cn } from "@/lib/utils";
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
  variant = "inline",
}: {
  target: { weeklyScheduleDayId: string } | { adHocRequestId: string };
  options: VehicleDriverOption[];
  existing?: ExistingAssignment;
  existingComment?: string | null;
  pickupTimeMode?: "select" | "text";
  variant?: "inline" | "panel";
}) {
  const isAdHoc = "adHocRequestId" in target;
  const [editing, setEditing] = useState(!existing && !existingComment);
  const [state, formAction] = useActionState(assignRoute, initialState);

  const [prevSuccess, setPrevSuccess] = useState(false);
  if (state.success && !prevSuccess) {
    setPrevSuccess(true);
    setEditing(false);
  }

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
    <form
      action={formAction}
      className={cn(
        variant === "panel" ? "space-y-1" : "flex flex-wrap items-start gap-2"
      )}
    >
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

      {variant === "panel" ? (
        <>
          <div className="flex items-center gap-1.5">
            <VehicleDriverCombobox
              name="vehicleDriverId"
              options={options}
              defaultValue={existing?.vehicleDriverId}
              className="min-w-0 flex-1 [&_input]:h-8"
            />

            {pickupTimeMode === "text" ? (
              <Input
                name="pickupTime"
                defaultValue={existing?.pickupTime}
                placeholder="10:30 PM"
                className="h-8 min-w-0 flex-1"
              />
            ) : (
              <Select name="pickupTime" defaultValue={existing?.pickupTime}>
                <SelectTrigger className="h-8 w-full min-w-0 px-2">
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
          </div>

          <div className="flex items-center gap-1">
            {isAdHoc ? (
              <Input
                name="comment"
                defaultValue={existingComment ?? ""}
                placeholder="Note to employee"
                className="h-8 min-w-0 flex-1"
              />
            ) : null}

            <SubmitButton />
            {existing || existingComment ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 shrink-0 px-0"
                aria-label="Cancel"
                onClick={() => setEditing(false)}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>

          {state.error ? (
            <p className="truncate text-xs text-destructive">{state.error}</p>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
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
                placeholder="10:30 PM"
                className="w-32 shrink-0"
              />
            ) : (
              <Select name="pickupTime" defaultValue={existing?.pickupTime}>
                <SelectTrigger className="w-28 shrink-0">
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
            {existing || existingComment ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            ) : null}
          </div>

          {isAdHoc ? (
            <Textarea
              name="comment"
              defaultValue={existingComment ?? ""}
              placeholder="Note to employee (optional -- can be sent without an assignment)"
              className="w-64"
              rows={1}
            />
          ) : null}

          {state.error ? (
            <p className="w-full text-xs text-destructive">{state.error}</p>
          ) : null}
        </>
      )}
    </form>
  );
}
