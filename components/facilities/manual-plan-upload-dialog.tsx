"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  importManualRoutePlanCsv,
  type ManualPlanImportState,
} from "@/actions/manual-route-plan.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExportCsvButton } from "@/components/facilities/export-csv-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: ManualPlanImportState = {};

const TEMPLATE_HEADERS = [
  "date",
  "shift",
  "vehicleNumber",
  "employeeEmail",
  "employeeName",
  "pickupPoint",
  "pickupTime",
  "visitOrder",
  "officeArrival",
  "office",
];

// Sample rows follow the real CSV format. One vehicle run = rows sharing the
// same date + shift + vehicleNumber; the planner learns the gaps between the
// listed pickup times and the office arrival.
const TEMPLATE_ROWS: string[][] = [
  ["2026-09-07", "10 PM", "DHKA-1245", "atia@commure.com", "Atia Rahman", "Zigatola", "20:35", "1", "22:00", "Regnum"],
  ["2026-09-07", "10 PM", "DHKA-1245", "tanjilur@commure.com", "Tanjilur Karim", "Dhanmondi 15", "20:42", "2", "22:00", "Regnum"],
  ["2026-09-07", "10 PM", "DHKA-1245", "utcha@commure.com", "Utcha Barua", "Green Road", "20:51", "3", "22:00", "Regnum"],
  ["2026-09-07", "12 AM", "DHKA-0917", "hamim@commure.com", "Hamim Golder", "Mirpur 10", "23:40", "1", "1:00 AM", "Regnum"],
  ["2026-09-07", "12 AM", "DHKA-0917", "niaz@commure.com", "Niaz Makdum", "Kazipara", "00:05", "2", "1:00 AM", "Regnum"],
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Learning from your plan…" : "Upload and teach the planner"}
    </Button>
  );
}

function DialogBody({ onImported }: { onImported: () => void }) {
  const [state, formAction] = useActionState(importManualRoutePlanCsv, initialState);

  useEffect(() => {
    if (state.results) onImported();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.results]);

  if (state.results) {
    const { stored, updated, skipped, learning } = state.results;
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Learned from <span className="font-medium">{stored}</span> new row(s)
          {updated > 0 ? (
            <>
              , refreshed <span className="font-medium">{updated}</span>
            </>
          ) : null}
          {skipped.length > 0 ? (
            <>
              , skipped <span className="font-medium">{skipped.length}</span>
            </>
          ) : null}
          .
        </p>
        {learning ? (
          <p className="text-xs text-muted-foreground">
            Route memory rebuilt: {learning.confidentLegs} trusted legs ·{" "}
            {learning.legCount} total · {learning.observationCount} observations.
            The next RUN MAPPING will plan pick-up times from your hand-tuned
            gaps.
          </p>
        ) : null}
        {skipped.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Skipped rows</p>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs text-muted-foreground">
              {skipped.map((s) => (
                <p key={`${s.line}-${s.reason}`}>
                  Line {s.line}: {s.reason}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onImported}>
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
          One row per employee pickup. Rows sharing the same{" "}
          <code className="font-mono">date + shift + vehicleNumber</code> form
          one vehicle run — the planner learns the real gaps between your listed
          pickup times (and last pickup → office arrival) per shift.
        </p>
        <p>
          Required columns:{" "}
          <code className="font-mono">
            date, shift, vehicleNumber, employeeEmail, pickupTime, officeArrival
          </code>
          . Optional:{" "}
          <code className="font-mono">
            employeeName, pickupPoint, visitOrder, office
          </code>
          . Times accept <code className="font-mono">20:35</code> or{" "}
          <code className="font-mono">8:35 PM</code>; late-night arrivals past
          midnight (<code className="font-mono">1:00 AM</code>) are handled.
        </p>
        <ExportCsvButton
          filename="manual-route-plan-template.csv"
          headers={TEMPLATE_HEADERS}
          rows={TEMPLATE_ROWS}
          label="Download template"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="manual-plan-file">CSV file</Label>
        <Input
          id="manual-plan-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          className="surface-accent"
          required
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <DialogFooter>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

export function ManualPlanUploadDialog({
  onImported,
}: {
  /** Called when an import finished so the parent can refresh learning stats. */
  onImported: () => void;
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
        <Button type="button" variant="outline" className="surface-accent">
          Teach from manual plan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Teach the planner from a manual route plan</DialogTitle>
        </DialogHeader>
        <DialogBody key={resetKey} onImported={onImported} />
      </DialogContent>
    </Dialog>
  );
}