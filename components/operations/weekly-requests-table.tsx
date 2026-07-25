"use client";

import { useActionState } from "react";
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
  CreateOnBehalfDialog,
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
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-center justify-between">
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
        <div className="flex flex-col items-end gap-2">
          <ApproveSelectedButton />
          <CreateOnBehalfDialog
            employees={employees}
            weekLabel={onBehalfWeekLabel}
            days={onBehalfDays}
          />
        </div>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border shadow-sm">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead
                rowSpan={2}
                className="sticky left-0 z-20 w-10 bg-muted/40 align-bottom"
              ></TableHead>
              <TableHead
                rowSpan={2}
                className="sticky left-10 z-20 bg-muted/40 align-bottom"
              >
                Employee
              </TableHead>
              <TableHead rowSpan={2} className="min-w-56 align-bottom">
                Contact Info
              </TableHead>
              <TableHead rowSpan={2} className="align-bottom">
                Week
              </TableHead>
              <TableHead
                colSpan={5}
                className="border-l text-center text-xs tracking-wide text-muted-foreground uppercase"
              >
                Weekly Schedule
              </TableHead>
              <TableHead rowSpan={2} className="align-bottom">
                Status
              </TableHead>
              <TableHead rowSpan={2} className="align-bottom">
                Actions
              </TableHead>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {DAY_LABELS.map((label, i) => (
                <TableHead
                  key={label}
                  className={`text-center ${i === 0 ? "border-l" : ""}`}
                >
                  {label.slice(0, 3)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="py-10 text-center text-muted-foreground"
                >
                  No weekly submissions yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => {
                const rowBg = index % 2 === 1 ? "bg-muted/20" : "bg-card";
                return (
                <TableRow
                  key={row.id}
                  className={index % 2 === 1 ? "bg-muted/20" : undefined}
                >
                  <TableCell className={`sticky left-0 z-10 ${rowBg}`}>
                    {row.status === "PENDING" ? (
                      <Checkbox name="scheduleId" value={row.id} />
                    ) : null}
                  </TableCell>
                  <TableCell className={`sticky left-10 z-10 ${rowBg}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{row.employee.fullName}</span>
                      {row.employee.employeeCode ? (
                        <Badge variant="secondary" className="w-fit font-normal">
                          {row.employee.employeeCode}
                        </Badge>
                      ) : null}
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
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={row.status} />
                      {row.status === "REJECTED" && row.rejectReason ? (
                        <p className="max-w-40 text-xs text-muted-foreground">
                          {row.rejectReason}
                        </p>
                      ) : null}
                      {row.reviewerName && row.status !== "PENDING" ? (
                        <p className="max-w-40 text-xs text-muted-foreground">
                          {row.status === "REJECTED" ? "Rejected" : "Approved"} by{" "}
                          {row.reviewerName}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <EditWeeklyScheduleDialog
                        scheduleId={row.id}
                        employeeName={row.employee.fullName}
                        initialValues={row.days.map((d) => d.value)}
                      />
                      {row.status === "PENDING" ? (
                        <RejectReasonDialog
                          scheduleId={row.id}
                          employeeName={row.employee.fullName}
                        />
                      ) : null}
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
