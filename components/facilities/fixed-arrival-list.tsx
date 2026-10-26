"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  saveFixedArrivalPickups,
  resendFixedArrivalPickupEmail,
  type SaveFixedArrivalListState,
} from "@/actions/fixed-arrival-pickup.actions";
import type { FixedArrivalListRow } from "@/lib/queries/route-planning";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const initialState: SaveFixedArrivalListState = {};

type EditableFields = { pickupTime: string; vehicleNumber: string };

function splitPastedColumn(text: string): string[] | null {
  if (!text.includes("\n") && !text.includes("\r")) return null;
  const lines = text.split(/\r\n|\r|\n/).map((line) => line.trim());
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save all"}
    </Button>
  );
}

function ResendEmailButton({
  employeeId,
  hasDetails,
}: {
  employeeId: string;
  hasDetails: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resend() {
    if (pending || !hasDetails) return;
    setError(null);
    startTransition(true);
    resendFixedArrivalPickupEmail(employeeId)
      .then((result) => {
        if (result.error) setError(result.error);
        else router.refresh();
      })
      .finally(() => startTransition(false));
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasDetails || pending}
        onClick={resend}
        title={
          hasDetails
            ? "Re-send the standing transport details email"
            : "Save pick-up details first to enable the email"
        }
      >
        {pending ? "Sending…" : "Resend email"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function FixedArrivalList({
  rows,
  vehicleLookup,
}: {
  rows: FixedArrivalListRow[];
  vehicleLookup: Record<string, { driverName: string; contactNumber: string }>;
}) {
  const [state, formAction] = useActionState(saveFixedArrivalPickups, initialState);
  const router = useRouter();
  const [values, setValues] = useState<EditableFields[]>(
    rows.map((r) => ({ pickupTime: r.pickupTime, vehicleNumber: r.vehicleNumber }))
  );

  useEffect(() => {
    if (state.savedCount !== undefined) {
      router.refresh();
    }
  }, [state.savedCount, router]);

  function fillColumnFrom(rowIndex: number, field: keyof EditableFields, lines: string[]) {
    setValues((prev) => {
      const next = [...prev];
      lines.forEach((line, i) => {
        const idx = rowIndex + i;
        if (idx < next.length) {
          next[idx] = { ...next[idx], [field]: line };
        }
      });
      return next;
    });
  }

  function handleChange(rowIndex: number, field: keyof EditableFields, value: string) {
    setValues((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [field]: value };
      return next;
    });
  }

  function handlePaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: keyof EditableFields
  ) {
    const lines = splitPastedColumn(e.clipboardData.getData("text"));
    if (!lines) return;
    e.preventDefault();
    fillColumnFrom(rowIndex, field, lines);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No fixed-arrival employees yet. They appear here once the role is
        assigned and the employee sets their arrival time.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Standing pick-up details for fixed-arrival employees — saved once and
        kept until you change them. The transport ON/OFF switch and arrival
        time are managed on the User Info page.
      </p>
      <div className="table-scrollbar max-h-[70vh] rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background">
                Employee Name
              </TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Pick-up Point</TableHead>
              <TableHead>Requested Arrival</TableHead>
              <TableHead className="min-w-32">Pick-up Time</TableHead>
              <TableHead className="min-w-32">Vehicle No</TableHead>
              <TableHead>Driver Name</TableHead>
              <TableHead>Contact Number</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const vehicleNumber = values[i].vehicleNumber.trim();
              const match = vehicleNumber
                ? vehicleLookup[vehicleNumber.toUpperCase()]
                : undefined;
              const driverName = match?.driverName ?? "—";
              const contactNumber = match?.contactNumber ?? "—";

              return (
                <TableRow key={row.employeeId}>
                  <TableCell className="sticky left-0 z-10 font-medium whitespace-nowrap">
                    <input type="hidden" name="employeeId" value={row.employeeId} />
                    <input type="hidden" name="employeeName" value={row.employeeName} />
                    {row.employeeName}
                    <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      Fixed arrival
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {row.address ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.pickupPoint ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.arrivalLabel ?? "Not set"}
                  </TableCell>
                  <TableCell>
                    <Input
                      name="pickupTime"
                      value={values[i].pickupTime}
                      placeholder="e.g. 8:00 PM"
                      className="min-w-28"
                      onChange={(e) => handleChange(i, "pickupTime", e.target.value)}
                      onPaste={(e) => handlePaste(e, i, "pickupTime")}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      name="vehicleNumber"
                      value={values[i].vehicleNumber}
                      placeholder="e.g. DHK-METRO-GA-1234"
                      className="min-w-36"
                      onChange={(e) => handleChange(i, "vehicleNumber", e.target.value)}
                      onPaste={(e) => handlePaste(e, i, "vehicleNumber")}
                    />
                    {vehicleNumber && !match ? (
                      <p className="mt-1 text-xs text-destructive">Not found</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {driverName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {contactNumber ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <ResendEmailButton
                      employeeId={row.employeeId}
                      hasDetails={Boolean(row.pickupTime && row.vehicleNumber)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: copy a column of vehicle numbers (or pick-up times) from your
        planning sheet and paste into the first row&apos;s cell — it fills
        downward automatically. Details stay saved every week until you edit
        them.
      </p>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.savedCount !== undefined ? (
        <div className="space-y-1 rounded-lg border bg-muted p-3 text-sm">
          <p>
            Saved <span className="font-medium">{state.savedCount}</span> standing
            assignment(s)
            {state.skipped && state.skipped.length > 0 ? (
              <>
                , skipped <span className="font-medium">{state.skipped.length}</span>
              </>
            ) : null}
            .
          </p>
          {state.skipped && state.skipped.length > 0 ? (
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {state.skipped.map((s, i) => (
                <li key={i}>
                  {s.employeeName}: {s.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
