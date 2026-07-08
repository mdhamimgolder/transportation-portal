import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getEmployeeDirectory } from "@/lib/queries/users";
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
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          User Info
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Employee profiles on file — address and pick-up point, for route
          planning reference.
        </p>
      </div>

      <SearchBox placeholder="Search by name, email, employee ID, or address" />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Pick-up point</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.fullName}</TableCell>
                  <TableCell>{employee.employeeCode ?? "—"}</TableCell>
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
