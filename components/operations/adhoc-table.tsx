"use client";

import { useActionState } from "react";
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

export function AdHocTable({ requests }: { requests: AdHocRequestRow[] }) {
  const [state, formAction] = useActionState(approveAdHocRequests, initialState);
  const pendingCount = requests.filter((r) => r.status === AdHocStatus.PENDING).length;

  return (
    <div className="space-y-3">
      {/*
        This form has no DOM children -- checkboxes and the submit button
        live elsewhere in the tree and associate via the `form` attribute.
        That avoids nesting a <form> inside each row's individual
        approve/decline forms (AdHocApprovalActions), which real per-row
        forms in the table body would otherwise require.
      */}
      <form id={BULK_FORM_ID} action={formAction} />
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
        {pendingCount > 0 ? <ApproveSelectedButton /> : null}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-20 w-10 bg-background"></TableHead>
              <TableHead className="sticky left-10 z-20 bg-background">Employee</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Contact Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Arrival Time</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-48">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  No ad-hoc requests yet.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="sticky left-0 z-10 bg-card">
                    {request.status === AdHocStatus.PENDING ? (
                      <Checkbox name="requestId" value={request.id} form={BULK_FORM_ID} />
                    ) : null}
                  </TableCell>
                  <TableCell className="sticky left-10 z-10 bg-card font-medium">
                    {request.employee.fullName}
                  </TableCell>
                  <TableCell>{request.employee.employeeCode ?? "—"}</TableCell>
                  <TableCell>{request.employee.email}</TableCell>
                  <TableCell>{request.employee.contactNumber ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatShortDate(request.date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {ARRIVAL_TIME_LABELS[request.arrivalTime] ?? request.arrivalTime}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {request.reason ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={request.status} />
                    {request.status === AdHocStatus.REJECTED && request.rejectReason ? (
                      <p className="mt-1 max-w-40 text-xs text-muted-foreground">
                        {request.rejectReason}
                      </p>
                    ) : null}
                    {request.reviewerName && request.status !== AdHocStatus.PENDING ? (
                      <p className="mt-1 max-w-40 text-xs text-muted-foreground">
                        {request.status === AdHocStatus.REJECTED ? "Rejected" : "Approved"} by{" "}
                        {request.reviewerName}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {request.status === AdHocStatus.PENDING ? (
                      <AdHocApprovalActions
                        requestId={request.id}
                        employeeName={request.employee.fullName}
                      />
                    ) : null}
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
