import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants/enums";

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  employeeCode: string | null;
  contactNumber: string | null;
  isActive: boolean;
  isBulkCreated: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function getAllUsers(q?: string): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role as Role,
    employeeCode: u.employeeCode,
    contactNumber: u.contactNumber,
    isActive: u.isActive,
    isBulkCreated: u.isBulkCreated,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }));

  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (r) =>
      r.fullName.toLowerCase().includes(needle) ||
      r.email.toLowerCase().includes(needle) ||
      r.role.toLowerCase().includes(needle) ||
      (r.employeeCode?.toLowerCase().includes(needle) ?? false)
  );
}

export type EmployeeDirectoryRow = {
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
};

/** Read-only employee directory, used by Facilities' "User Info" page. */
export async function getEmployeeDirectory(q?: string): Promise<EmployeeDirectoryRow[]> {
  const users = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { fullName: "asc" },
    include: { homeAddress: true, pickupAddress: true },
  });

  const rows: EmployeeDirectoryRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    employeeCode: u.employeeCode,
    department: u.department,
    email: u.email,
    contactNumber: u.contactNumber,
    address: u.address,
    pickupPoint: u.pickupPoint,
    officeLocation: u.officeLocation,
    homeLatitude: u.homeAddress?.latitude ?? null,
    homeLongitude: u.homeAddress?.longitude ?? null,
    pickupLatitude: u.pickupAddress?.latitude ?? null,
    pickupLongitude: u.pickupAddress?.longitude ?? null,
    isActive: u.isActive,
  }));

  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (r) =>
      r.fullName.toLowerCase().includes(needle) ||
      r.email.toLowerCase().includes(needle) ||
      (r.employeeCode?.toLowerCase().includes(needle) ?? false) ||
      (r.department?.toLowerCase().includes(needle) ?? false) ||
      (r.contactNumber?.toLowerCase().includes(needle) ?? false) ||
      (r.address?.toLowerCase().includes(needle) ?? false) ||
      (r.officeLocation?.toLowerCase().includes(needle) ?? false)
  );
}
