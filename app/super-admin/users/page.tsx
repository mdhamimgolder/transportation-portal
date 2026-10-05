import Link from "next/link";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getAllUsers } from "@/lib/queries/users";
import { toggleUserActiveAction } from "@/actions/user-management.actions";
import { SearchBox } from "@/components/shared/search-box";
import { AddEmployeeDialog } from "@/components/super-admin/add-employee-dialog";
import { BulkUploadDialog } from "@/components/super-admin/bulk-upload-dialog";
import { UserRoleForm } from "@/components/super-admin/user-role-form";
import { SetPasswordDialog } from "@/components/shared/set-password-dialog";
import { ResendCredentialsDialog } from "@/components/shared/resend-credentials-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireRole([Role.SUPER_ADMIN]);
  const { q, page: pageParam } = await searchParams;
  const result = await getAllUsers(q, Number(pageParam ?? 1));
  const paginationHref = (page: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(page));
    return `/super-admin/users?${params}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">
            Users
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every account in the portal — search the directory, add a user
            manually, bulk-upload a batch, or change someone&apos;s access
            role below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BulkUploadDialog />
          <AddEmployeeDialog allowAllRoles />
        </div>
      </div>

      <SearchBox placeholder="Search by name, email, employee ID, or role" />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Access role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              result.rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="sticky left-0 z-10 bg-card font-medium">
                    {user.fullName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>{user.employeeCode ?? "—"}</TableCell>
                  <TableCell>
                    <UserRoleForm
                      userId={user.id}
                      currentRole={user.role}
                      disabled={user.id === session.id}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "secondary" : "outline"}>
                      {user.isActive ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {user.lastLoginAt
                      ? user.lastLoginAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <SetPasswordDialog userId={user.id} fullName={user.fullName} />
                      <ResendCredentialsDialog userId={user.id} fullName={user.fullName} />
                      {user.id === session.id ? null : (
                        <form action={toggleUserActiveAction}>
                          <input type="hidden" name="id" value={user.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            {user.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                        </form>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {result.total.toLocaleString()} users · Page {result.page} of {result.pageCount}
        </span>
        <div className="flex gap-3">
          {result.page > 1 ? (
            <Link className="underline underline-offset-4" href={paginationHref(result.page - 1)}>Previous</Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link className="underline underline-offset-4" href={paginationHref(result.page + 1)}>Next</Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
