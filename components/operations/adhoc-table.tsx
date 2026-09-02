"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  approveAdHocRequests,
  type ApproveAdHocRequestsState,
} from "@/actions/adhoc.actions";
import { AdHocStatus } from "@/lib/constants/enums";
import { formatShortDate } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { Button } from "@/components/ui/button";
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
import { AdHocApprovalActions } from "@/components/operations/adhoc-approval-actions";
import {
  CreateAdHocOnBehalfDialog,
  type OnBehalfEmployeeOption,
} from "@/components/operations/create-on-behalf-dialog";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export type AdHocRequestRow = {
  id: string;
  status: string;
  rejectReason: string | null;
  reviewerName: string | null;
  date: Date;
  arrivalTime: string;
  reason: string | null;
  employee: {
    fullName: string;
    employeeCode: string | null;
    email: string;
    contactNumber: string | null;
  };
};

const initialState: ApproveAdHocRequestsState = {};
const BULK_FORM_ID = "adhoc-bulk-approve-form";

function ApproveSelectedButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" form={BULK_FORM_ID} disabled={pending}>
      {pending ? "Approving..." : "Approve selected"}
    </Button>
  );
}

export function AdHocTable({
  requests,
  employees,
}: {
  requests: AdHocRequestRow[];
  employees: OnBehalfEmployeeOption[];
}) {
  const [state, formAction] = useActionState(approveAdHocRequests, initialState);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pendingCount = requests.filter((r) => r.status === AdHocStatus.PENDING).length;

  const pendingIds = requests
    .filter((r) => r.status === AdHocStatus.PENDING)
    .map((r) => r.id);
  const selectedPendingCount = pendingIds.filter((id) => selectedIds.has(id)).length;
  const allPendingSelected =
    pendingIds.length > 0 && selectedPendingCount === pendingIds.length;

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPending() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPendingSelected) {
        pendingIds.forEach((id) => next.delete(id));
      } else {
        pendingIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/*
        This form carries the bulk-approve payload as hidden inputs driven by
        the table's selection state -- checkboxes and the submit button live
        elsewhere in the tree and associate via the `form` attribute. That
        avoids nesting a <form> inside each row's individual approve/decline
        forms (AdHocApprovalActions), which real per-row forms in the table
        body would otherwise require.
      */}
      <form
        id={BULK_FORM_ID}
        action={formAction}
        onSubmit={() => setSelectedIds(new Set())}
      >
        {Array.from(selectedIds).map((id) => (
          <input key={id} type="hidden" name="requestId" value={id} />
        ))}
      </form>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{requests.length}</span>{" "}
          request{requests.length === 1 ? "" : "s"}
          {pendingCount > 0 ? (
            <span className="ml-1">
              &middot; <span className="font-medium text-foreground">{pendingCount}</span>{" "}
              awaiting review
            </span>
          ) : null}
        </p>
        <div className="flex flex-col items-end gap-2">
          {pendingCount > 0 ? <ApproveSelectedButton /> : null}
          <CreateAdHocOnBehalfDialog employees={employees} />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allPendingSelected}
                    onCheckedChange={toggleAllPending}
                    disabled={pendingIds.length === 0}
                    aria-label="Select all pending requests"
                  />
                  <span>Employee</span>
                </div>
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="w-48">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.has(request.id)}
                        onCheckedChange={() => toggleId(request.id)}
                        disabled={request.status !== AdHocStatus.PENDING}
                        aria-label={`Select ${request.employee.fullName}`}
                      />
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
                  <TableCell className="align-top">
                    <div className="flex flex-col items-start gap-1 py-0.5">
                      <StatusBadge status={request.status} />
                      {request.status === AdHocStatus.REJECTED && request.rejectReason ? (
                        <p
                          className="max-w-40 truncate text-xs text-muted-foreground"
                          title={request.rejectReason}
                        >
                          {request.rejectReason}
                        </p>
                      ) : null}
                      {request.reviewerName && request.status !== AdHocStatus.PENDING ? (
                        <p
                          className="max-w-40 truncate text-xs text-muted-foreground"
                          title={`${request.status === AdHocStatus.REJECTED ? "Rejected" : "Approved"} by ${request.reviewerName}`}
                        >
                          {request.status === AdHocStatus.REJECTED ? "Rejected" : "Approved"} by{" "}
                          {request.reviewerName}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {request.status === AdHocStatus.PENDING ? (
                      <AdHocApprovalActions
                        requestId={request.id}
                        employeeName={request.employee.fullName}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
