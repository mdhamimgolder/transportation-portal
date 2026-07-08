import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getAllUsers } from "@/lib/queries/users";
import { toggleUserActiveAction } from "@/actions/user-management.actions";
import { SearchBox } from "@/components/shared/search-box";
import { AddEmployeeDialog } from "@/components/super-admin/add-employee-dialog";
import { BulkUploadDialog } from "@/components/super-admin/bulk-upload-dialog";
import { UserRoleForm } from "@/components/super-admin/user-role-form";
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
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireRole([Role.SUPER_ADMIN]);
  const { q } = await searchParams;
  const users = await getAllUsers(q);

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
          <AddEmployeeDialog />
        </div>
      </div>

      <SearchBox placeholder="Search by name, email, employee ID, or role" />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Access role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName}</TableCell>
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
                    {user.id === session.id ? null : (
                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="id" value={user.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {user.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </form>
                    )}
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
