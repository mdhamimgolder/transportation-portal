"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateWeeklyLockSettingAction,
  type UpdateWeeklyLockState,
} from "@/actions/settings.actions";
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

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const initialState: UpdateWeeklyLockState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}

export function WeeklyLockForm({
  dayOfWeek,
  time,
}: {
  dayOfWeek: number;
  time: string;
}) {
  const [state, formAction] = useActionState(updateWeeklyLockSettingAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="dayOfWeek">Lock day</Label>
        <Select name="dayOfWeek" defaultValue={String(dayOfWeek)}>
          <SelectTrigger id="dayOfWeek" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((day) => (
              <SelectItem key={day.value} value={day.value}>
                {day.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="time">Lock time</Label>
        <Input id="time" name="time" type="time" defaultValue={time} className="w-32" />
      </div>
      <SubmitButton />
      {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
      {state.success ? (
        <p className="w-full text-sm text-green-foreground">Lock time updated.</p>
      ) : null}
    </form>
  );
}
