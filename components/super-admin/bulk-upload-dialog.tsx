"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  bulkCreateUsersAction,
  type BulkCreateUsersState,
} from "@/actions/user-management.actions";
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

const initialState: BulkCreateUsersState = {};

const SAMPLE_HEADERS = [
  "fullName",
  "email",
  "role",
  "employeeCode",
  "contactNumber",
  "address",
  "pickupPoint",
];
const SAMPLE_ROW = [
  "Jamie Rivera",
  "jamie.rivera@example.com",
  "EMPLOYEE",
  "EMP0042",
  "01700000000",
  "12 Example Street, Dhaka",
  "Gulshan Circle 2",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Uploading…" : "Upload and create accounts"}
    </Button>
  );
}

function BulkUploadDialogBody({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useActionState(bulkCreateUsersAction, initialState);

  if (state.results) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Created <span className="font-medium">{state.results.created.length}</span>{" "}
          account(s)
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
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Generated credentials</p>
              <ExportCsvButton
                filename="bulk-upload-credentials.csv"
                headers={["Full Name", "Email", "Temporary Password"]}
                rows={state.results.created.map((r) => [
                  r.fullName,
                  r.email,
                  r.tempPassword,
                ])}
                label="Export credentials"
              />
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-muted p-3 font-mono text-xs">
              {state.results.created.map((r) => (
                <p key={r.email}>
                  {r.email} — {r.tempPassword}
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
          CSV columns: <code className="font-mono">fullName, email, role</code>{" "}
          (required), plus optional{" "}
          <code className="font-mono">
            employeeCode, contactNumber, address, pickupPoint
          </code>
          . Role must be one of EMPLOYEE, OPERATIONS, FACILITIES, SUPER_ADMIN.
        </p>
        <ExportCsvButton
          filename="bulk-upload-template.csv"
          headers={SAMPLE_HEADERS}
          rows={[SAMPLE_ROW]}
          label="Download template"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="file">CSV file</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <DialogFooter>
        <SubmitButton />
      </DialogFooter>
    </form>
  );
}

export function BulkUploadDialog() {
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
        <Button type="button" variant="outline">
          Bulk upload
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk upload employees</DialogTitle>
        </DialogHeader>
        <BulkUploadDialogBody key={resetKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
