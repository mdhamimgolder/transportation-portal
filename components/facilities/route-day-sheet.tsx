"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveDaySheetAssignments,
  type SaveDaySheetState,
} from "@/actions/route-assignment.actions";
import type { DaySheetRow } from "@/lib/queries/route-planning";
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

const initialState: SaveDaySheetState = {};

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

export function RouteDaySheet({
  rows,
  vehicleLookup,
}: {
  rows: DaySheetRow[];
  vehicleLookup: Record<string, { driverName: string; contactNumber: string }>;
}) {
  const [state, formAction] = useActionState(saveDaySheetAssignments, initialState);
  const [values, setValues] = useState<EditableFields[]>(
    rows.map((r) => ({ pickupTime: r.pickupTime, vehicleNumber: r.vehicleNumber }))
  );

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
        No one is scheduled for transport on this day in the latest approved week.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Pick-up Point</TableHead>
              <TableHead>Requested Arrival</TableHead>
              <TableHead className="min-w-32">Pick-up Time</TableHead>
              <TableHead className="min-w-32">Vehicle No</TableHead>
              <TableHead>Driver Name</TableHead>
              <TableHead>Contact Number</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const vehicleNumber = values[i].vehicleNumber.trim();
              const match = vehicleNumber
                ? vehicleLookup[vehicleNumber.toUpperCase()]
                : undefined;

              return (
                <TableRow key={row.weeklyScheduleDayId}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <input
                      type="hidden"
                      name="weeklyScheduleDayId"
                      value={row.weeklyScheduleDayId}
                    />
                    <input type="hidden" name="employeeName" value={row.employeeName} />
                    {row.employeeName}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {row.address ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.pickupPoint ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.requestedArrivalLabel ?? "—"}
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
                    {match?.driverName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {match?.contactNumber ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: copy a column of vehicle numbers (or pick-up times) from your
        planning sheet and paste into the first row's cell — it fills
        downward automatically.
      </p>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.savedCount !== undefined ? (
        <div className="space-y-1 rounded-lg border bg-muted p-3 text-sm">
          <p>
            Saved <span className="font-medium">{state.savedCount}</span> assignment(s)
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
