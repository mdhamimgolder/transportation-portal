"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Mail, Phone, MapPin } from "lucide-react";
import {
  approveSchedules,
  type ApproveSchedulesState,
} from "@/actions/weekly-schedule.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { RejectReasonDialog } from "@/components/operations/reject-reason-dialog";
import { EditWeeklyScheduleDialog } from "@/components/operations/edit-weekly-schedule-dialog";
import { NO_TRANSPORT_VALUE } from "@/lib/constants/arrival-times";
import { DAY_LABELS } from "@/lib/date/week";
import {
  CreateWeeklyOnBehalfDialog,
  type OnBehalfEmployeeOption,
} from "@/components/operations/create-on-behalf-dialog";

export type WeeklyRequestRow = {
  id: string;
  status: string;
  rejectReason: string | null;
  reviewerName: string | null;
  weekLabel: string;
  employee: {
    fullName: string;
    employeeCode: string | null;
    email: string;
    contactNumber: string | null;
    address: string | null;
  };
  days: { dayOfWeek: number; display: string; value: string }[];
};

const initialState: ApproveSchedulesState = {};

function ApproveSelectedButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Approving..." : "Approve selected"}
    </Button>
  );
}

export function WeeklyRequestsTable({
  rows,
  employees,
  onBehalfWeekLabel,
  onBehalfDays,
}: {
  rows: WeeklyRequestRow[];
  employees: OnBehalfEmployeeOption[];
  onBehalfWeekLabel: string;
  onBehalfDays: { label: string; dateLabel: string }[];
}) {
  const [state, formAction] = useActionState(approveSchedules, initialState);
  const pendingIds = rows.filter((r) => r.status === "PENDING").map((r) => r.id);
  const pendingCount = pendingIds.length;
  const [selected, setSelected] = useState<string[]>([]);

  // Filter out any selected IDs that are no longer present in the current rows
  // (e.g. after a filter/week change) — avoids stale selections without a
  // setState-in-effect.
  const visibleSelected = useMemo(
    () => selected.filter((id) => pendingIds.includes(id)),
    [selected, pendingIds]
  );

  function toggleAll(checked: boolean) {
    setSelected(checked ? pendingIds : []);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((v) => v !== id)));
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{rows.length}</span>{" "}
          submission{rows.length === 1 ? "" : "s"}
          {pendingCount > 0 ? (
            <span className="ml-1">
              &middot; <span className="font-medium text-foreground">{pendingCount}</span>{" "}
              awaiting review
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {pendingIds.length > 0 ? (
            <label className="flex min-h-9 items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={
                  visibleSelected.length === pendingIds.length
                    ? true
                    : visibleSelected.length > 0
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) => toggleAll(checked === true)}
                aria-label="Select all pending submissions"
              />
              Select all
            </label>
          ) : null}
          <ApproveSelectedButton />
          <CreateWeeklyOnBehalfDialog
            employees={employees}
            weekLabel={onBehalfWeekLabel}
            days={onBehalfDays}
          />
        </div>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="table-scrollbar max-h-[70vh] rounded-lg border shadow-sm">
        <Table>
          <TableHeader className="bg-muted/40">
            {/* A single sticky column (checkbox + Employee combined into one
                cell) -- two separate sticky columns with a hardcoded offset
                between them is fragile: an empty checkbox cell doesn't
                reliably render at its requested width under the table's
                auto layout algorithm, so the offset drifts and the sticky
                Employee cell visually overlaps the next column (confirmed
                on mobile). One sticky cell has no such offset to get wrong. */}
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-20 bg-muted/40">
                <div className="flex items-center gap-2">
                  <span className="inline-block size-4" />
                  <span>Employee</span>
                </div>
              </TableHead>
              <TableHead className="min-w-56">Contact Info</TableHead>
              <TableHead>Week</TableHead>
              {DAY_LABELS.map((label, i) => (
                <TableHead
                  key={label}
                  className={`text-center ${i === 0 ? "border-l" : ""}`}
                >
                  {label.slice(0, 3)}
                </TableHead>
              ))}
              <TableHead className="w-44">Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-muted-foreground"
                >
                  No weekly submissions yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => {
                return (
                <TableRow
                  key={row.id}
                  className={`relative transition-transform duration-150 hover:z-10 hover:scale-[1.012] hover:bg-muted/70 hover:shadow-md ${
                    index % 2 === 1 ? "bg-muted/20" : ""
                  }`}
                >
                  <TableCell className="sticky left-0 z-10 bg-card">
                    <div className="flex items-center gap-2">
                      {row.status === "PENDING" ? (
                        <Checkbox
                          name="scheduleId"
                          value={row.id}
                          checked={visibleSelected.includes(row.id)}
                          onCheckedChange={(checked) => toggleOne(row.id, checked === true)}
                        />
                      ) : (
                        <span className="inline-block size-4" />
                      )}
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{row.employee.fullName}</span>
                        {row.employee.employeeCode ? (
                          <Badge variant="secondary" className="w-fit font-normal">
                            {row.employee.employeeCode}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Mail className="size-3 shrink-0" />
                        {row.employee.email}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3 shrink-0" />
                        {row.employee.contactNumber ?? "—"}
                      </span>
                      <span className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 size-3 shrink-0" />
                        <span className="line-clamp-2">
                          {row.employee.address ?? "—"}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.weekLabel}
                  </TableCell>
                  {row.days.map((day, i) => (
                    <TableCell
                      key={day.dayOfWeek}
                      className={`text-center whitespace-nowrap ${i === 0 ? "border-l" : ""} ${
                        day.value === NO_TRANSPORT_VALUE
                          ? "text-muted-foreground"
                          : "font-medium"
                      }`}
                    >
                      {day.display}
                    </TableCell>
                  ))}
                  <TableCell className="align-top">
                    <div className="flex flex-col items-start gap-1 py-0.5">
                      <StatusBadge status={row.status} />
                      {row.status === "REJECTED" && row.rejectReason ? (
                        <p
                          className="max-w-40 truncate text-xs text-muted-foreground"
                          title={row.rejectReason}
                        >
                          {row.rejectReason}
                        </p>
                      ) : null}
                      {row.reviewerName && row.status !== "PENDING" ? (
                        <p
                          className="max-w-40 truncate text-xs text-muted-foreground"
                          title={`${row.status === "REJECTED" ? "Rejected" : "Approved"} by ${row.reviewerName}`}
                        >
                          {row.status === "REJECTED" ? "Rejected" : "Approved"} by{" "}
                          {row.reviewerName}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {row.status === "PENDING" ? (
                        <>
                          <EditWeeklyScheduleDialog
                            scheduleId={row.id}
                            employeeName={row.employee.fullName}
                            initialValues={row.days.map((d) => d.value)}
                          />
                          <RejectReasonDialog
                            scheduleId={row.id}
                            employeeName={row.employee.fullName}
                          />
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </form>
  );
}
