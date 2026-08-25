"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  editWeeklySchedule,
  type EditWeeklyScheduleState,
} from "@/actions/weekly-schedule.actions";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { DAY_LABELS } from "@/lib/date/week";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: EditWeeklyScheduleState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

function EditWeeklyScheduleDialogBody({
  scheduleId,
  initialValues,
  onDone,
}: {
  scheduleId: string;
  initialValues: string[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(editWeeklySchedule, initialState);
  const [values, setValues] = useState<string[]>(initialValues);

  if (state.success) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">Schedule updated.</p>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        {DAY_LABELS.map((label, index) => (
          <div key={label} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {label.slice(0, 3)}
            </p>
            <input type="hidden" name={`day-${index}`} value={values[index]} />
            <Select
              value={values[index]}
              onValueChange={(value) =>
                setValues((prev) => prev.map((v, i) => (i === index ? value : v)))
              }
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
          </div>
        ))}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <DialogFooter>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

export function EditWeeklyScheduleDialog({
  scheduleId,
  employeeName,
  initialValues,
}: {
  scheduleId: string;
  employeeName: string;
  initialValues: string[];
}) {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setResetKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {employeeName}&apos;s weekly schedule</DialogTitle>
        </DialogHeader>
        <EditWeeklyScheduleDialogBody
          key={resetKey}
          scheduleId={scheduleId}
          initialValues={initialValues}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
