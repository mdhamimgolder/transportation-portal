"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitWeeklySchedule,
  type SubmitWeeklyScheduleState,
} from "@/actions/weekly-schedule.actions";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SubmitWeeklyScheduleState = {};

type DayInfo = {
  label: string;
  dateLabel: string;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Submitting..." : "Submit schedule"}
    </Button>
  );
}

export function WeeklyScheduleForm({
  days,
  initialValues,
  disabled,
}: {
  days: DayInfo[];
  initialValues: string[];
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(submitWeeklySchedule, initialState);
  const [values, setValues] = useState<string[]>(initialValues);

  function setDay(index: number, value: string) {
    setValues((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function applySameTimeToAll() {
    const first = values[0];
    if (!first || first === NO_TRANSPORT_VALUE) return;
    setValues((prev) => prev.map(() => first));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select your arrival time for each day, or mark a day as not needing
          transport.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={applySameTimeToAll}
        >
          Same time for all days
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        {days.map((day, index) => (
          <Card key={day.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {day.label}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{day.dateLabel}</p>
            </CardHeader>
            <CardContent>
              <input type="hidden" name={`day-${index}`} value={values[index]} />
              <Select
                value={values[index]}
                onValueChange={(value) => setDay(index, value)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TRANSPORT_VALUE}>Not Required</SelectItem>
                  {ARRIVAL_TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ))}
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-foreground">
          Schedule submitted successfully.
        </p>
      ) : null}

      <SubmitButton disabled={disabled} />
    </form>
  );
}
