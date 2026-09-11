"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveFixedArrivalTime,
  type SaveFixedArrivalState,
} from "@/actions/fixed-arrival.actions";
import { ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SaveFixedArrivalState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Set my arrival time"}
    </Button>
  );
}

/**
 * The one-time arrival picker for Fixed Arrival employees. After the first
 * save the server locks the value — re-submissions are rejected.
 */
export function FixedArrivalPicker() {
  const [state, formAction] = useActionState(saveFixedArrivalTime, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fixed-arrival-select">
          When do you need to reach the office?
        </Label>
        <Select name="arrivalTime" defaultValue="">
          <SelectTrigger id="fixed-arrival-select" className="w-full">
            <SelectValue placeholder="Choose your arrival time" />
          </SelectTrigger>
          <SelectContent>
            {ARRIVAL_TIME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          This is a one-time choice. After you save it, Facilities will plan
          your pickup around this time every week — to change it later, inform
          the Facilities team.
        </p>
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? (
        <p className="flex items-center gap-2 rounded-lg border bg-muted p-3 text-sm text-green">
          Arrival time saved and locked. Facilities will map you from now on.
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}