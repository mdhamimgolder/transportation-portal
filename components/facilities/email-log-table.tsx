"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  resendRouteAssignmentEmail,
  type ResendEmailState,
} from "@/actions/route-assignment.actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type EmailLogRow = {
  id: string;
  kind: string;
  recipient: string;
  recipientName: string;
  subject: string;
  status: string;
  error: string | null;
  createdAt: string;
  routeAssignmentId: string | null;
};

const STATUS_PRESENTATION: Record<
  string,
  { label: string; className: string }
> = {
  SENT: { label: "Sent", className: "bg-emerald-500/10 text-emerald-600" },
  FAILED: { label: "Failed", className: "bg-rose-500/10 text-rose-600" },
  PENDING: { label: "Sending…", className: "bg-amber-500/10 text-amber-600" },
  SKIPPED_DEV: {
    label: "Dev skip",
    className: "bg-muted text-muted-foreground",
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ResendButton({ routeAssignmentId }: { routeAssignmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResendEmailState | null>(null);

  async function handleResend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setBusy(true);
    setResult(null);
    try {
      const outcome = await resendRouteAssignmentEmail({}, formData);
      setResult(outcome);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleResend}>
      <input type="hidden" name="routeAssignmentId" value={routeAssignmentId} />
      <Button type="submit" variant="outline" size="sm" disabled={busy}>
        {busy ? "Sending…" : "Resend"}
      </Button>
      {result?.status === "SENT" ? (
        <p className="mt-1 text-xs text-emerald-600">Resent successfully.</p>
      ) : null}
      {result?.status === "FAILED" || result?.error ? (
        <p className="mt-1 max-w-56 text-xs text-destructive">
          {result.error ?? result.status}
        </p>
      ) : null}
    </form>
  );
}

export function EmailLogTable({ rows }: { rows: EmailLogRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No email notifications match this filter.
      </p>
    );
  }

  return (
    <div className="table-scrollbar rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const preset = STATUS_PRESENTATION[row.status];
            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatTime(row.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {row.recipientName}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {row.recipient}
                </TableCell>
                <TableCell className="max-w-72 truncate text-sm">
                  {row.subject}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                      preset?.className ?? "bg-muted text-muted-foreground"
                    )}
                    title={row.error ?? undefined}
                  >
                    {preset?.label ?? row.status}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.status === "FAILED" && row.routeAssignmentId ? (
                    <ResendButton routeAssignmentId={row.routeAssignmentId} />
                  ) : row.error ? (
                    <span className="text-xs text-destructive">
                      {row.error}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}