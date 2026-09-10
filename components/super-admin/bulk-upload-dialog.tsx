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
  "department",
  "contactNumber",
  "address",
  "homeLatitude",
  "homeLongitude",
  "pickupPoint",
  "password",
];
const SAMPLE_ROW = [
  "Jamie Rivera",
  "jamie.rivera@example.com",
  "EMPLOYEE",
  "EMP0042",
  "Logistics",
  "01700000000",
  "12 Example Street, Dhaka",
  "23.7806",
  "90.4070",
  "Gulshan Circle 2",
  "Passw0rd!23",
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
          {state.results.updatedAccounts > 0 ? (
            <>
              , updated{" "}
              <span className="font-medium">{state.results.updatedAccounts}</span> existing
            </>
          ) : null}
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
            <p className="text-sm font-medium">Accounts created</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-muted p-3 font-mono text-xs">
              {state.results.created.map((r) => (
                <p key={r.email}>
                  {r.fullName} — {r.email}
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
          Required columns:{" "}
          <code className="font-mono">fullName, email</code>. Everything else is
          optional —{" "}
          <code className="font-mono">
            role, employeeCode, department, contactNumber, address, pickupPoint,
            homeLatitude, homeLongitude, password
          </code>{" "}
          — leave any cell blank and fill it in later from User Info. Rows
          whose email already exists are UPDATED with the non-blank values
          (blank cells keep the current value). Role must be one of EMPLOYEE,
          OPERATIONS, FACILITIES, SUPER_ADMIN (blank = EMPLOYEE). A blank
          password gets a generated temporary one emailed to the user; a
          provided password must be at least 8 characters.
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
        <Input id="file" name="file" type="file" accept=".csv,text/csv" className="surface-accent" required />
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
        <Button type="button" variant="outline" className="surface-accent">
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
