import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants/enums";

const USER_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 120;

export type UserPage<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

function normalizePage(requestedPage: number, pageCount: number): number {
  const page = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  return Math.min(Math.max(page, 1), pageCount);
}

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

export async function getAllUsers(
  q?: string,
  requestedPage = 1
): Promise<UserPage<UserRow>> {
  const needle = q?.trim().slice(0, MAX_SEARCH_LENGTH) ?? "";
  const where = needle
    ? {
        OR: [
          { fullName: { contains: needle, mode: "insensitive" as const } },
          { email: { contains: needle, mode: "insensitive" as const } },
          { role: { contains: needle, mode: "insensitive" as const } },
          { employeeCode: { contains: needle, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const total = await prisma.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
  const page = normalizePage(requestedPage, pageCount);
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      employeeCode: true,
      contactNumber: true,
      isActive: true,
      isBulkCreated: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }, { id: "asc" }],
    skip: (page - 1) * USER_PAGE_SIZE,
    take: USER_PAGE_SIZE,
  });

  return {
    rows: users.map((user) => ({ ...user, role: user.role as Role })),
    page,
    pageSize: USER_PAGE_SIZE,
    pageCount,
    total,
  };
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
  homeLatitude: number | null;
  homeLongitude: number | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  isActive: boolean;
};

/** Read-only employee directory, used by Facilities' "User Info" page. */
export async function getEmployeeDirectory(
  q?: string,
  requestedPage = 1
): Promise<UserPage<EmployeeDirectoryRow>> {
  const needle = q?.trim().slice(0, MAX_SEARCH_LENGTH) ?? "";
  const where = {
    role: "EMPLOYEE",
    ...(needle
      ? {
          OR: [
            { fullName: { contains: needle, mode: "insensitive" as const } },
            { email: { contains: needle, mode: "insensitive" as const } },
            { employeeCode: { contains: needle, mode: "insensitive" as const } },
            { department: { contains: needle, mode: "insensitive" as const } },
            { contactNumber: { contains: needle, mode: "insensitive" as const } },
            { address: { contains: needle, mode: "insensitive" as const } },
            { pickupPoint: { contains: needle, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const total = await prisma.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
  const page = normalizePage(requestedPage, pageCount);
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      department: true,
      email: true,
      contactNumber: true,
      address: true,
      pickupPoint: true,
      isActive: true,
      homeAddress: { select: { latitude: true, longitude: true } },
      pickupAddress: { select: { latitude: true, longitude: true } },
    },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    skip: (page - 1) * USER_PAGE_SIZE,
    take: USER_PAGE_SIZE,
  });

  return {
    rows: users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      department: user.department,
      email: user.email,
      contactNumber: user.contactNumber,
      address: user.address,
      pickupPoint: user.pickupPoint,
      homeLatitude: user.homeAddress?.latitude ?? null,
      homeLongitude: user.homeAddress?.longitude ?? null,
      pickupLatitude: user.pickupAddress?.latitude ?? null,
      pickupLongitude: user.pickupAddress?.longitude ?? null,
      isActive: user.isActive,
    })),
    page,
    pageSize: USER_PAGE_SIZE,
    pageCount,
    total,
  };
}
