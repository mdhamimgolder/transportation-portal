import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getEmployeeDirectory } from "@/lib/queries/users";
import { SearchBox } from "@/components/shared/search-box";
import { AddEmployeeDialog } from "@/components/super-admin/add-employee-dialog";
import { BulkUploadDialog } from "@/components/super-admin/bulk-upload-dialog";
import { EditEmployeeProfileDialog } from "@/components/facilities/edit-employee-profile-dialog";
import { SetPasswordDialog } from "@/components/shared/set-password-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function FacilitiesUserInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole([Role.FACILITIES]);
  const { q } = await searchParams;
  const employees = await getEmployeeDirectory(q);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">
            User Info
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Employee profiles on file — address and pick-up point, for route
            planning reference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BulkUploadDialog />
          <AddEmployeeDialog />
        </div>
      </div>

      <SearchBox placeholder="Search by name, email, employee ID, or address" />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-background">Name</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Pick-up point</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="sticky left-0 z-10 bg-card font-medium">
                    {employee.fullName}
                  </TableCell>
                  <TableCell>{employee.employeeCode ?? "—"}</TableCell>
                  <TableCell>{employee.department ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {employee.email}
                  </TableCell>
                  <TableCell>{employee.contactNumber ?? "—"}</TableCell>
                  <TableCell className="max-w-56 truncate">
                    {employee.address ?? "—"}
                  </TableCell>
                  <TableCell>{employee.pickupPoint ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={employee.isActive ? "secondary" : "outline"}>
                      {employee.isActive ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EditEmployeeProfileDialog
                        userId={employee.id}
                        fullName={employee.fullName}
                        contactNumber={employee.contactNumber}
                        address={employee.address}
                        pickupPoint={employee.pickupPoint}
                      />
                      <SetPasswordDialog userId={employee.id} fullName={employee.fullName} />
                    </div>
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
