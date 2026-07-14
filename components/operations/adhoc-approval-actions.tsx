"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  approveAdHocRequest,
  rejectAdHocRequest,
  type ApproveAdHocRequestState,
  type RejectAdHocRequestState,
} from "@/actions/adhoc.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const approveInitialState: ApproveAdHocRequestState = {};
const rejectInitialState: RejectAdHocRequestState = {};

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
      {pending ? "Declining..." : "Decline request"}
    </Button>
  );
}

export function AdHocApprovalActions({
  requestId,
  employeeName,
}: {
  requestId: string;
  employeeName: string;
}) {
  const [approveState, approveAction] = useActionState(approveAdHocRequest, approveInitialState);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectState, rejectAction] = useActionState(rejectAdHocRequest, rejectInitialState);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <form action={approveAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <ApproveButton />
        </form>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              Decline
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline {employeeName}&apos;s ad-hoc request</DialogTitle>
            </DialogHeader>
            <form action={rejectAction} className="space-y-4">
              <input type="hidden" name="requestId" value={requestId} />
              <div className="space-y-2">
                <Label htmlFor={`adhoc-reason-${requestId}`}>Reason</Label>
                <Textarea id={`adhoc-reason-${requestId}`} name="reason" required />
              </div>
              {rejectState.error ? (
                <p className="text-sm text-destructive">{rejectState.error}</p>
              ) : null}
              <DialogFooter>
                <RejectSubmitButton />
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {approveState.error ? (
        <p className="text-xs text-destructive">{approveState.error}</p>
      ) : null}
    </div>
  );
}
