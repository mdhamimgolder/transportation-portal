import "server-only";
import { prisma } from "@/lib/prisma";
import type { AuditActionType } from "@/lib/constants/enums";

type Actor = {
  id: string;
  email: string;
  role: string;
} | null;

export async function writeAuditLog(params: {
  actor: Actor;
  actionType: AuditActionType;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  description: string;
}): Promise<void> {
  const { actor, actionType, entityType, entityId, before, after, description } =
    params;

  await prisma.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: actor?.role ?? null,
      actionType,
      entityType,
      entityId,
      beforeValue: before !== undefined ? JSON.stringify(before) : null,
      afterValue: after !== undefined ? JSON.stringify(after) : null,
      description,
    },
  });
}
