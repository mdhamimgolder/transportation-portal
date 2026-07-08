"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitAdHocRequest,
  type SubmitAdHocRequestState,
} from "@/actions/adhoc.actions";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
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

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        For urgent, same-day transport needs. This bypasses the normal
        approval chain and goes straight to Operations and Facilities.
      </p>
      <div className="space-y-2">
        <Label htmlFor="arrivalTime">Arrival time (tonight – tomorrow 6 AM)</Label>
        <Select name="arrivalTime" required>
          <SelectTrigger className="w-full" id="arrivalTime">
            <SelectValue placeholder="Select a time" />
          </SelectTrigger>
          <SelectContent>
            {ADHOC_ARRIVAL_TIME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          Ad-hoc request submitted to Operations and Facilities.
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
