"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  bulkCreateVehicleDriversAction,
  type BulkCreateVehicleDriversState,
} from "@/actions/vehicle-driver.actions";
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

const initialState: BulkCreateVehicleDriversState = {};

const SAMPLE_HEADERS = ["driverName", "contactNumber", "vehicleNumber", "vendor"];
const SAMPLE_ROW = ["Karim Sheikh", "01711000099", "DHK-METRO-GA-4321", "Green Line Transport"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Uploading…" : "Upload and create records"}
    </Button>
  );
}

function BulkUploadDialogBody({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useActionState(bulkCreateVehicleDriversAction, initialState);

  if (state.results) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Created <span className="font-medium">{state.results.created.length}</span>{" "}
          record(s)
          {state.results.skipped.length > 0 ? (
            <>
              , skipped{" "}
              <span className="font-medium">{state.results.skipped.length}</span> row(s)
            </>
          ) : null}
          .
        </p>

        {state.results.created.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Records created</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-muted p-3 font-mono text-xs">
              {state.results.created.map((r) => (
                <p key={r.vehicleNumber}>
                  {r.driverName} — {r.vehicleNumber}
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
          Required CSV columns:{" "}
          <code className="font-mono">
            driverName, contactNumber, vehicleNumber, vendor
          </code>
          .
        </p>
        <ExportCsvButton
          filename="vehicle-driver-bulk-upload-template.csv"
          headers={SAMPLE_HEADERS}
          rows={[SAMPLE_ROW]}
          label="Download template"
        />
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

export function VehicleDriverBulkUploadDialog() {
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
          Bulk upload
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk upload vehicles &amp; drivers</DialogTitle>
        </DialogHeader>
        <BulkUploadDialogBody key={resetKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
