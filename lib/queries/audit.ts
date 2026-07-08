import "server-only";
import { prisma } from "@/lib/prisma";

export type AuditLogRow = {
  id: string;
  whenLabel: string;
  actorName: string;
  actorRole: string | null;
  actionType: string;
  entityType: string;
  description: string | null;
};

export async function getAuditLogRows(q?: string, limit = 300): Promise<AuditLogRow[]> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const rows: AuditLogRow[] = logs.map((l) => ({
    id: l.id,
    whenLabel: l.createdAt.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    actorName: l.actorEmail ?? "System",
    actorRole: l.actorRole,
    actionType: l.actionType,
    entityType: l.entityType,
    description: l.description,
  }));

  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (r) =>
      r.actorName.toLowerCase().includes(needle) ||
      r.actionType.toLowerCase().includes(needle) ||
      r.entityType.toLowerCase().includes(needle) ||
      (r.description?.toLowerCase().includes(needle) ?? false)
  );
}
