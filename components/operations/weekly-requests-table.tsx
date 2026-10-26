"use client";

import { Mail, Phone, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { WeeklyScheduleBulkUploadDialog } from "@/components/operations/weekly-schedule-bulk-upload-dialog";
import type { WeekOption } from "@/components/operations/weekly-requests-filters";

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

export function WeeklyRequestsTable({
  rows,
  employees,
  onBehalfWeekLabel,
  onBehalfDays,
  uploadWeekOptions,
}: {
  rows: WeeklyRequestRow[];
  employees: OnBehalfEmployeeOption[];
  onBehalfWeekLabel: string;
  onBehalfDays: { label: string; dateLabel: string }[];
  uploadWeekOptions: WeekOption[];
}) {
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-3">
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
          <WeeklyScheduleBulkUploadDialog weekOptions={uploadWeekOptions} />
          <CreateWeeklyOnBehalfDialog
            employees={employees}
            weekLabel={onBehalfWeekLabel}
            days={onBehalfDays}
          />
        </div>
      </div>

      <div className="table-scrollbar max-h-[70vh] rounded-lg border shadow-sm">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-20 bg-muted/40">
                Employee
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
    </div>
  );
}
