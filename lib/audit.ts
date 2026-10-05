import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Who performed the action — a SessionUser satisfies this. */
export type AuditActor = { id: string; role: string } | null;

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  description: string;
};

/** JSON-safe snapshot: Dates → ISO strings, undefined dropped. */
function snapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toData(actor: AuditActor, input: AuditInput): Prisma.AuditLogCreateInput {
  return {
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: snapshot(input.before),
    after: snapshot(input.after),
    description: input.description,
  };
}

/**
 * The audit write as an un-awaited Prisma promise, for inclusion in a batch
 * `prisma.$transaction([...])` so the audit row commits atomically with the
 * change it describes.
 */
export function auditEntry(
  actor: AuditActor,
  input: AuditInput,
  tx: Pick<Prisma.TransactionClient, "auditLog"> = prisma
) {
  return tx.auditLog.create({ data: toData(actor, input) });
}

/**
 * Writes an audit row for a change that has already committed. Never throws:
 * a failed audit write is logged, not surfaced, so it can't undo a successful
 * user action.
 */
export async function audit(actor: AuditActor, input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({ data: toData(actor, input) });
  } catch (error) {
    logger.error("audit", "failed to write audit log", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
