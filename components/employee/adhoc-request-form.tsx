"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import {
  submitAdHocRequest,
  type SubmitAdHocRequestState,
} from "@/actions/adhoc.actions";
import {
  ADHOC_MIN_ADVANCE_HOURS,
  eligibleAdhocArrivalOptions,
} from "@/lib/constants/adhoc-arrival-times";
import { startOfToday } from "@/lib/date/week";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SubmitAdHocRequestState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Submitting..." : "Submit ad-hoc request"}
    </Button>
  );
}

export function AdHocRequestForm() {
  const [state, formAction] = useActionState(submitAdHocRequest, initialState);
  const arrivalOptions = useMemo(
    () => eligibleAdhocArrivalOptions(startOfToday(), new Date()),
    []
  );

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        For urgent, same-day transport needs. This bypasses the normal
        approval chain and goes straight to Operation-Admin and Facilities.
      </p>
      <div className="space-y-2">
        <Label htmlFor="arrivalTime">
          Arrival time (tonight – tomorrow 6 AM)
        </Label>
        {arrivalOptions.length > 0 ? (
          <Select name="arrivalTime" required>
            <SelectTrigger className="w-full" id="arrivalTime">
              <SelectValue placeholder="Select a time" />
            </SelectTrigger>
            <SelectContent>
              {arrivalOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            No arrival time is selectable right now -- the ad-hoc window
            (10:00 PM – 6:00 AM) falls inside the{" "}
            {ADHOC_MIN_ADVANCE_HOURS}-hour notice period. Please try again
            later.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Arrival must be at least {ADHOC_MIN_ADVANCE_HOURS} hours from now.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">Reason (optional)</Label>
        <Textarea id="reason" name="reason" placeholder="e.g. working late" />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-foreground">
          Ad-hoc request submitted to Operation-Admin and Facilities.
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
