import Link from "next/link";
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
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  const { q, page: pageParam } = await searchParams;
  const result = await getEmployeeDirectory(q, Number(pageParam ?? 1));
  const paginationHref = (page: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(page));
    return `/facilities/user-info?${params}`;
  };

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
              <TableHead>Home latitude/longitude</TableHead>
              <TableHead>Pick-up point</TableHead>
              <TableHead>Pick-up latitude/longitude</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              result.rows.map((employee) => (
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
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {employee.homeLatitude !== null && employee.homeLongitude !== null
                      ? `${employee.homeLatitude}, ${employee.homeLongitude}`
                      : "Not set"}
                  </TableCell>
                  <TableCell>{employee.pickupPoint ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {employee.pickupLatitude !== null && employee.pickupLongitude !== null
                      ? `${employee.pickupLatitude}, ${employee.pickupLongitude}`
                      : "Not set"}
                  </TableCell>
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
                        homeLatitude={employee.homeLatitude}
                        homeLongitude={employee.homeLongitude}
                        pickupLatitude={employee.pickupLatitude}
                        pickupLongitude={employee.pickupLongitude}
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
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {result.total.toLocaleString()} employees · Page {result.page} of {result.pageCount}
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
