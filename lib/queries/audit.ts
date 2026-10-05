import "server-only";
import { prisma } from "@/lib/prisma";

const AUDIT_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 120;

export type AuditLogRow = {
  id: string;
  createdAtLabel: string;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  before: unknown;
  after: unknown;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

export async function getAuditLogPage(
  q?: string,
  requestedPage = 1
): Promise<AuditLogPage> {
  const needle = q?.trim().slice(0, MAX_QUERY_LENGTH) ?? "";
  const matchingActors = needle
    ? await prisma.user.findMany({
        where: {
          OR: [
            { fullName: { contains: needle, mode: "insensitive" } },
            { email: { contains: needle, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 500,
      })
    : [];

  const where = needle
    ? {
        OR: [
          { action: { contains: needle, mode: "insensitive" as const } },
          { entityType: { contains: needle, mode: "insensitive" as const } },
          { entityId: { contains: needle, mode: "insensitive" as const } },
          { description: { contains: needle, mode: "insensitive" as const } },
          ...(matchingActors.length
            ? [{ actorId: { in: matchingActors.map((actor) => actor.id) } }]
            : []),
        ],
      }
    : undefined;

  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
  });

  const actorIds = [...new Set(logs.map((log) => log.actorId).filter((id): id is string => id !== null))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true, email: true },
      })
    : [];
  const actorById = new Map(
    actors.map((actor) => [actor.id, actor.fullName || actor.email])
  );
  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return {
    rows: logs.map((log) => ({
      id: log.id,
      createdAtLabel: dateFormatter.format(log.createdAt),
      actorName: log.actorId ? actorById.get(log.actorId) ?? "Deleted user" : "System",
      actorRole: log.actorRole,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      description: log.description,
      before: log.before,
      after: log.after,
    })),
    page,
    pageSize: AUDIT_PAGE_SIZE,
    pageCount,
    total,
  };
}