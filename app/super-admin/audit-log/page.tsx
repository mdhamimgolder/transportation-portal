import Link from "next/link";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getAuditLogPage } from "@/lib/queries/audit";
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

function pageHref(page: number, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  return `/super-admin/audit-log?${params}`;
}

export default async function SuperAdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole([Role.SUPER_ADMIN]);
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 120) ?? "";
  const requestedPage = Number(params.page ?? 1);
  const result = await getAuditLogPage(query, requestedPage);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-medium">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.total.toLocaleString()} recorded system events.
        </p>
      </div>

      <SearchBox placeholder="Search actor, action, entity, or description" />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When (Dhaka)</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Changes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No audit events found.
                </TableCell>
              </TableRow>
            ) : (
              result.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {row.createdAtLabel}
                  </TableCell>
                  <TableCell className="font-medium">{row.actorName}</TableCell>
                  <TableCell>
                    {row.actorRole ? <Badge variant="outline">{row.actorRole}</Badge> : "System"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span>{row.entityType}</span>
                    {row.entityId && <span className="block font-mono text-xs">{row.entityId}</span>}
                  </TableCell>
                  <TableCell className="max-w-96 whitespace-normal">{row.description}</TableCell>
                  <TableCell>
                    {row.before || row.after ? (
                      <details className="max-w-80">
                        <summary className="cursor-pointer text-sm text-muted-foreground">View</summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
                          {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {result.page} of {result.pageCount}
        </span>
        <div className="flex gap-2">
          {result.page > 1 && (
            <Link className="underline underline-offset-4" href={pageHref(result.page - 1, query)}>
              Previous
            </Link>
          )}
          {result.page < result.pageCount && (
            <Link className="underline underline-offset-4" href={pageHref(result.page + 1, query)}>
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}