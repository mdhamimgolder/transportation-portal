import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getAuditLogRows } from "@/lib/queries/audit";
import { SearchBox } from "@/components/shared/search-box";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function SuperAdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole([Role.SUPER_ADMIN]);
  const { q } = await searchParams;
  const rows = await getAuditLogRows(q);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Audit Log
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The most recent {rows.length === 300 ? "300" : rows.length} system
          events — logins, approvals, and account changes.
        </p>
      </div>

      <SearchBox placeholder="Search by actor, action, or entity" />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No audit events yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {row.whenLabel}
                  </TableCell>
                  <TableCell className="font-medium">{row.actorName}</TableCell>
                  <TableCell>
                    {row.actorRole ? (
                      <Badge variant="outline">{row.actorRole}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.actionType}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.entityType}
                  </TableCell>
                  <TableCell className="max-w-80 truncate">
                    {row.description ?? "—"}
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
