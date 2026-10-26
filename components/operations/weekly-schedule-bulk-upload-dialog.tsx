"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  bulkUploadWeeklySchedules,
  type BulkUploadWeeklyScheduleState,
} from "@/actions/weekly-schedule.actions";
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
import { ExportCsvButton } from "@/components/facilities/export-csv-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: BulkUploadWeeklyScheduleState = {};

// CSV format: Employee Name, Employee Email, then Monday–Friday arrival times.
const SAMPLE_HEADERS = [
  "Employee Name",
  "Employee Email",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];
const SAMPLE_ROW = [
  "Masnun Rahman Bhuiyan",
  "example100@commure.com",
  "10:00 PM",
  "Not Required",
  "1:00 AM",
  "Not Required",
  "11:00 PM",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Uploading…" : "Upload and approve"}
    </Button>
  );
}

function BulkUploadDialogBody({
  weekOptions,
  onDone,
}: {
  weekOptions: { value: string; label: string }[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(bulkUploadWeeklySchedules, initialState);

  if (state.results) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Uploaded and approved{" "}
          <span className="font-medium">{state.results.created.length}</span>{" "}
          schedule(s)
          {state.results.skipped.length > 0 ? (
            <>
              , skipped{" "}
              <span className="font-medium">{state.results.skipped.length}</span> row(s)
            </>
          ) : null}
          .
        </p>

        {state.results.created.length > 0 ? (
          <p
            className={
              state.results.emailsEnabled
                ? "text-xs text-muted-foreground"
                : "text-sm text-amber-600"
            }
          >
            {state.results.emailsEnabled
              ? `Schedule emails have been sent to ${state.results.created.length} employee(s).`
              : "Schedules saved, but employee emails were NOT sent — email sending is disabled outside production."}
          </p>
        ) : null}

        {state.results.created.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Schedules created</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-muted p-3 font-mono text-xs">
              {state.results.created.map((r) => (
                <p key={r.email}>
                  {r.employeeName} — {r.email}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {state.results.skipped.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Skipped rows</p>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs text-muted-foreground">
              {state.results.skipped.map((s) => (
                <p key={s.line}>
                  Line {s.line}: {s.reason}
                </p>
              ))}
            </div>
          </div>
        ) : null}

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
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          The CSV needs <code className="font-mono">Employee Name</code>,{" "}
          <code className="font-mono">Employee Email</code>, and the day columns{" "}
          <code className="font-mono">
            Monday, Tuesday, Wednesday, Thursday, Friday
          </code>{" "}
          as headers. Each data row has the employee&apos;s name, unique email,
          and that day&apos;s arrival time (e.g.{" "}
          <code className="font-mono">10:00 PM</code>) or{" "}
          <code className="font-mono">Not Required</code>. The system matches
          each row by email and pulls the rest of the profile from the database.
          Uploaded schedules are approved immediately.
        </p>
        <ExportCsvButton
          filename="weekly-schedule-bulk-upload-template.csv"
          headers={SAMPLE_HEADERS}
          rows={[SAMPLE_ROW]}
          label="Download template"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="weekStartDate">Week</Label>
        <Select name="weekStartDate" required>
          <SelectTrigger className="w-full" id="weekStartDate">
            <SelectValue placeholder="Select a week" />
          </SelectTrigger>
          <SelectContent>
            {weekOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="file">CSV file</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" className="surface-accent" required />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <DialogFooter>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

export function WeeklyScheduleBulkUploadDialog({
  weekOptions,
}: {
  weekOptions: { value: string; label: string }[];
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
        <Button type="button">Upload CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload weekly schedules</DialogTitle>
        </DialogHeader>
        <BulkUploadDialogBody
          key={resetKey}
          weekOptions={weekOptions}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
