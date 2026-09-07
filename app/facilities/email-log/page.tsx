import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  EmailLogTable,
  type EmailLogRow,
} from "@/components/facilities/email-log-table";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = ["ALL", "SENT", "FAILED", "PENDING", "SKIPPED_DEV"] as const;

export default async function FacilitiesEmailLogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const { status } = await searchParams;
  const activeFilter =
    typeof status === "string" &&
    (STATUS_FILTERS as readonly string[]).includes(status)
      ? status
      : "ALL";

  const where = activeFilter !== "ALL" ? { status: activeFilter } : {};

  const [logs, counts] = await Promise.all([
    prisma.emailNotificationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        kind: true,
        recipient: true,
        recipientName: true,
        subject: true,
        status: true,
        error: true,
        createdAt: true,
        routeAssignmentId: true,
      },
    }),
    prisma.emailNotificationLog.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countsByStatus: Record<string, number> = {};
  for (const c of counts) countsByStatus[c.status] = c._count._all;
  const total = Object.values(countsByStatus).reduce((a, b) => a + b, 0);
  const failedCount = countsByStatus.FAILED ?? 0;

  const rows: EmailLogRow[] = logs.map((l) => ({
    id: l.id,
    kind: l.kind,
    recipient: l.recipient,
    recipientName: l.recipientName,
    subject: l.subject,
    status: l.status,
    error: l.error,
    createdAt: l.createdAt.toISOString(),
    routeAssignmentId: l.routeAssignmentId,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Email Log</h1>
        <p className="text-sm text-muted-foreground">
          Every employee notification email and its delivery result. Failed or
          dev-skipped notifications can be resent from here.
        </p>
      </div>

      {failedCount > 0 ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm text-rose-600">
          {failedCount} notification email(s) failed to send. Resend them from
          the list below.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const count = f === "ALL" ? total : (countsByStatus[f] ?? 0);
          return (
            <Link
              key={f}
              href={f === "ALL" ? "/facilities/email-log" : `/facilities/email-log?status=${f}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === f
                  ? "border-transparent bg-ink-foreground text-black"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {f === "SKIPPED_DEV" ? "Dev skip" : f.charAt(0) + f.slice(1).toLowerCase()} · {count}
            </Link>
          );
        })}
      </div>

      <EmailLogTable rows={rows} />
    </div>
  );
}