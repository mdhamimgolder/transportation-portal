"use client";

import { useDeferredValue, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportUsersButton } from "@/components/facilities/export-users-button";
import { BulkUploadDialog } from "@/components/super-admin/bulk-upload-dialog";
import { AddEmployeeDialog } from "@/components/super-admin/add-employee-dialog";
import { EditEmployeeProfileDialog } from "@/components/facilities/edit-employee-profile-dialog";
import { FixedArrivalServiceControls } from "@/components/facilities/fixed-arrival-service-controls";
import { SetPasswordDialog } from "@/components/shared/set-password-dialog";
import { ResendCredentialsDialog } from "@/components/shared/resend-credentials-dialog";
import { DeleteUserDialog } from "@/components/facilities/delete-user-dialog";

type UserInfoRow = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  department: string | null;
  email: string;
  contactNumber: string | null;
  address: string | null;
  pickupPoint: string | null;
  officeLocation: string | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  isActive: boolean;
  role: string;
  fixedArrivalTime: string | null;
  fixedArrivalActive: boolean;
};

function matchesSearch(row: UserInfoRow, needle: string): boolean {
  if (!needle) return true;
  return (
    row.fullName.toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle) ||
    (row.employeeCode?.toLowerCase().includes(needle) ?? false) ||
    (row.department?.toLowerCase().includes(needle) ?? false) ||
    (row.contactNumber?.toLowerCase().includes(needle) ?? false) ||
    (row.address?.toLowerCase().includes(needle) ?? false) ||
    (row.officeLocation?.toLowerCase().includes(needle) ?? false)
  );
}

export function UserInfoTable({ employees }: { employees: UserInfoRow[] }) {
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const needle = deferredQ.trim().toLowerCase();
  const visible = needle ? employees.filter((e) => matchesSearch(e, needle)) : employees;

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
          <ExportUsersButton
            employees={visible.map((e) => ({
              fullName: e.fullName,
              email: e.email,
              pickupPoint: e.pickupPoint,
            }))}
          />
          <BulkUploadDialog />
          <AddEmployeeDialog />
        </div>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email, employee ID, or address"
        className="surface-accent w-72"
      />

      <div className="table-scrollbar max-h-[70vh] rounded-lg border">
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
              <TableHead>Fixed arrival</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="sticky left-0 z-10 bg-card font-medium">
                    {employee.fullName}
                    {employee.role === "FIXED_ARRIVAL" ? (
                      <span
                        className="ml-1.5 inline-flex rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600"
                        title="Fixed-arrival employee"
                      >
                        Fixed arrival
                      </span>
                    ) : null}
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
                    {employee.role === "FIXED_ARRIVAL" ? (
                      <FixedArrivalServiceControls
                        key={`${employee.id}:${employee.fixedArrivalActive}:${employee.fixedArrivalTime}`}
                        userId={employee.id}
                        active={employee.fixedArrivalActive}
                        arrivalTime={employee.fixedArrivalTime}
                      />
                    ) : (
                      "—"
                    )}
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
                        employeeCode={employee.employeeCode}
                        contactNumber={employee.contactNumber}
                        address={employee.address}
                        pickupPoint={employee.pickupPoint}
                        officeLocation={employee.officeLocation}
                        homeLatitude={employee.homeLatitude}
                        homeLongitude={employee.homeLongitude}
                        pickupLatitude={employee.pickupLatitude}
                        pickupLongitude={employee.pickupLongitude}
                        role={employee.role}
                        fixedArrivalTime={employee.fixedArrivalTime}
                      />
                      <SetPasswordDialog userId={employee.id} fullName={employee.fullName} />
                      <ResendCredentialsDialog userId={employee.id} fullName={employee.fullName} />
                      <DeleteUserDialog userId={employee.id} fullName={employee.fullName} />
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