import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Batch-resolves user IDs to display names, for inline "reviewed by" /
 * "assigned by" labels. Not a Prisma relation on purpose -- WeeklySchedule,
 * AdHocRequest, and RouteAssignment intentionally don't carry a `reviewedBy`/
 * `assignedBy` relation (removed with the old audit-log system), so this
 * does one lookup query instead.
 */
export async function getUserNamesByIds(
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (uniqueIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, fullName: true },
  });

  return new Map(users.map((u) => [u.id, u.fullName]));
}
