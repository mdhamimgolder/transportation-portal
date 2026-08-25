"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  approveContactChange,
  rejectContactChange,
  type ApproveContactChangeState,
  type RejectContactChangeState,
} from "@/actions/contact-change.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type ContactApprovalRow = {
  id: string;
  status: string;
  oldContactNumber: string;
  newContactNumber: string;
  rejectReason: string | null;
  createdAt: string;
  employee: {
    fullName: string;
    employeeCode: string | null;
    email: string;
  };
};

const approveInitialState: ApproveContactChangeState = {};
const rejectInitialState: RejectContactChangeState = {};

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Approving..." : "Approve"}
    </Button>
  );
}

function RejectSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Rejecting..." : "Reject request"}
    </Button>
  );
}

function RejectDialog({ requestId, employeeName }: { requestId: string; employeeName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(rejectContactChange, rejectInitialState);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Reject {employeeName}&apos;s contact number change
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="requestId" value={requestId} />
          <div className="space-y-2">
            <Label htmlFor={`contact-reason-${requestId}`}>Reason</Label>
            <Textarea id={`contact-reason-${requestId}`} name="reason" required />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <DialogFooter>
            <RejectSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactApprovalCard({ row }: { row: ContactApprovalRow }) {
  const [state, formAction] = useActionState(approveContactChange, approveInitialState);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {row.employee.fullName}{" "}
            <span className="font-normal text-muted-foreground">
              ({row.employee.employeeCode ?? "—"})
            </span>
          </CardTitle>
          <StatusBadge status={row.status} />
        </div>
        <p className="text-xs text-muted-foreground">{row.employee.email}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Current contact number
            </p>
            <p className="text-sm">{row.oldContactNumber || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Requested contact number
            </p>
            <p className="text-sm">{row.newContactNumber}</p>
          </div>
        </div>

        {row.status === "REJECTED" && row.rejectReason ? (
          <p className="text-xs text-muted-foreground">
            Reason: {row.rejectReason}
          </p>
        ) : null}

        {row.status === "PENDING" ? (
          <div className="flex items-center gap-2">
            <form action={formAction}>
              <input type="hidden" name="requestId" value={row.id} />
              <ApproveButton />
            </form>
            <RejectDialog requestId={row.id} employeeName={row.employee.fullName} />
          </div>
        ) : null}
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
