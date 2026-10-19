"use client";

import { formatShortDate } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreateAdHocOnBehalfDialog,
  type OnBehalfEmployeeOption,
} from "@/components/operations/create-on-behalf-dialog";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export type AdHocRequestRow = {
  id: string;
  date: Date;
  arrivalTime: string;
  reason: string | null;
  employee: {
    fullName: string;
    employeeCode: string | null;
    email: string;
    contactNumber: string | null;
  };
  routeAssignment: {
    pickupTime: string;
    vehicleDriver: {
      driverName: string;
      contactNumber: string;
      vehicleNumber: string;
    };
  } | null;
};

export function AdHocTable({
  requests,
  employees,
}: {
  requests: AdHocRequestRow[];
  employees: OnBehalfEmployeeOption[];
}) {
  const assignedCount = requests.filter((r) => r.routeAssignment).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{requests.length}</span>{" "}
          request{requests.length === 1 ? "" : "s"}
          {assignedCount > 0 ? (
            <span className="ml-1">
              &middot; <span className="font-medium text-foreground">{assignedCount}</span>{" "}
              assigned by Facilities
            </span>
          ) : null}
        </p>
        <div className="flex flex-col items-end gap-2">
          <CreateAdHocOnBehalfDialog employees={employees} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background">
                Employee
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Driver name</TableHead>
              <TableHead>Contact number</TableHead>
              <TableHead>Pick-up time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No ad-hoc requests yet.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow
                  key={request.id}
                  className="transition-colors hover:bg-muted/50"
                >
                  <TableCell className="sticky left-0 z-10 min-w-40 max-w-52 bg-card">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {request.employee.fullName}
                      </p>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={`${request.employee.email} · ${
                          request.employee.contactNumber ?? "no contact number"
                        }`}
                      >
                        {request.employee.employeeCode
                          ? `${request.employee.employeeCode} · `
                          : ""}
                        {request.employee.email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatShortDate(request.date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                      {ARRIVAL_TIME_LABELS[request.arrivalTime] ??
                        request.arrivalTime}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {request.reason ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {request.routeAssignment ? (
                      <span>
                        {request.routeAssignment.vehicleDriver.driverName}{" "}
                        <span className="text-xs text-muted-foreground">
                          · {request.routeAssignment.vehicleDriver.vehicleNumber}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {request.routeAssignment?.vehicleDriver.contactNumber ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                    {request.routeAssignment?.pickupTime ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
