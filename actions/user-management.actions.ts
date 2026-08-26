"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { hashPassword } from "@/lib/auth/password";
import { parseCsv } from "@/lib/csv";
import { Role, ALL_ROLES, OFFICE_LOCATIONS } from "@/lib/constants/enums";

function isValidRole(value: string): value is Role {
  return (ALL_ROLES as string[]).includes(value);
}

function requiredField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type CreateUserState = {
  error?: string;
  created?: { email: string; fullName: string };
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

  const fullName = requiredField(formData, "fullName");
  const email = requiredField(formData, "email");
  const role = formData.get("role");
  const employeeCode = requiredField(formData, "employeeCode");
  const department = requiredField(formData, "department");
  const contactNumber = requiredField(formData, "contactNumber");
  const address = requiredField(formData, "address");
  const pickupPoint = requiredField(formData, "pickupPoint");
  const officeLocation = requiredField(formData, "officeLocation");
  const password = requiredField(formData, "password");

  if (!fullName) return { error: "Full name is required." };
  if (!email) return { error: "Email is required." };
  if (typeof role !== "string" || !isValidRole(role)) {
    return { error: "Please select a valid role." };
  }
  if (!employeeCode) return { error: "Employee ID is required." };
  if (!department) return { error: "Department is required." };
  if (!contactNumber) return { error: "Contact number is required." };
  if (!address) return { error: "Address is required." };
  if (!pickupPoint) return { error: "Pick-up point is required." };
  if (!officeLocation || !OFFICE_LOCATIONS.includes(officeLocation as (typeof OFFICE_LOCATIONS)[number])) {
    return { error: "Please select a valid office location." };
  }
  if (!password || password.length < 8) {
    return { error: "Password is required and must be at least 8 characters." };
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { error: "A user with this email already exists." };
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      fullName,
      role,
      employeeCode,
      department,
      contactNumber,
      address,
      pickupPoint,
      officeLocation,
      passwordHash,
      mustChangePassword: false,
      isBulkCreated: false,
    },
  });

  revalidatePath("/super-admin/users");
  revalidatePath("/facilities/user-info");
  return { created: { email: user.email, fullName: user.fullName } };
}

export type BulkCreateResultRow = { email: string; fullName: string };
export type BulkCreateSkipRow = { line: number; reason: string };
export type BulkCreateUsersState = {
  error?: string;
  results?: { created: BulkCreateResultRow[]; skipped: BulkCreateSkipRow[] };
};

export async function bulkCreateUsersAction(
  _prevState: BulkCreateUsersState,
  formData: FormData
): Promise<BulkCreateUsersState> {
  await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file." };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "The CSV file has no data rows." };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name);
  const idx = {
    fullName: colIndex("fullname"),
    email: colIndex("email"),
    role: colIndex("role"),
    employeeCode: colIndex("employeecode"),
    department: colIndex("department"),
    contactNumber: colIndex("contactnumber"),
    address: colIndex("address"),
    pickupPoint: colIndex("pickuppoint"),
    password: colIndex("password"),
  };
  if (
    idx.fullName === -1 ||
    idx.email === -1 ||
    idx.role === -1 ||
    idx.employeeCode === -1 ||
    idx.department === -1 ||
    idx.contactNumber === -1 ||
    idx.address === -1 ||
    idx.pickupPoint === -1 ||
    idx.password === -1
  ) {
    return {
      error:
        "CSV must include fullName, email, role, employeeCode, department, contactNumber, address, pickupPoint, and password columns.",
    };
  }

  const created: BulkCreateResultRow[] = [];
  const skipped: BulkCreateSkipRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cols = rows[i];
    const fullName = cols[idx.fullName]?.trim();
    const email = cols[idx.email]?.trim().toLowerCase();
    const role = cols[idx.role]?.trim().toUpperCase();
    const employeeCode = cols[idx.employeeCode]?.trim();
    const department = cols[idx.department]?.trim();
    const contactNumber = cols[idx.contactNumber]?.trim();
    const address = cols[idx.address]?.trim();
    const pickupPoint = cols[idx.pickupPoint]?.trim();
    const password = cols[idx.password]?.trim();

    if (
      !fullName ||
      !email ||
      !role ||
      !employeeCode ||
      !department ||
      !contactNumber ||
      !address ||
      !pickupPoint ||
      !password
    ) {
      skipped.push({
        line,
        reason:
          "Missing one or more required fields (fullName, email, role, employeeCode, department, contactNumber, address, pickupPoint, password).",
      });
      continue;
    }
    if (!isValidRole(role)) {
      skipped.push({ line, reason: `Unknown role "${role}".` });
      continue;
    }
    if (password.length < 8) {
      skipped.push({ line, reason: "Password must be at least 8 characters." });
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      skipped.push({ line, reason: `Email ${email} already exists.` });
      continue;
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        role,
        employeeCode,
        department,
        contactNumber,
        address,
        pickupPoint,
        passwordHash,
        mustChangePassword: false,
        isBulkCreated: true,
      },
    });

    created.push({ email: user.email, fullName: user.fullName });
  }

  revalidatePath("/super-admin/users");
  revalidatePath("/facilities/user-info");
  return { results: { created, skipped } };
}

export type UpdateUserRoleState = { error?: string; success?: boolean };

export async function updateUserRoleAction(
  _prevState: UpdateUserRoleState,
  formData: FormData
): Promise<UpdateUserRoleState> {
  const session = await requireRole([Role.SUPER_ADMIN]);

  const id = formData.get("id");
  const role = formData.get("role");
  if (typeof id !== "string" || !id) return { error: "Missing user." };
  if (typeof role !== "string" || !isValidRole(role)) {
    return { error: "Please select a valid role." };
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "User not found." };

  if (user.id === session.id && role !== user.role) {
    return { error: "You can't change your own role." };
  }
  if (user.role === role) {
    return { success: true };
  }

  await prisma.user.update({ where: { id }, data: { role } });

  revalidatePath("/super-admin/users");
  return { success: true };
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.SUPER_ADMIN]);
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.id === session.id) return;

  const nextActive = !user.isActive;
  await prisma.user.update({
    where: { id },
    data: {
      isActive: nextActive,
      deletedAt: nextActive ? null : new Date(),
      deletedBy: nextActive ? null : session.id,
    },
  });

  revalidatePath("/super-admin/users");
}

const setUserPasswordSchema = z
  .object({
    userId: z.string().min(1, "Missing user."),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm the password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SetUserPasswordState = { error?: string; success?: boolean };

export async function setUserPasswordAction(
  _prevState: SetUserPasswordState,
  formData: FormData
): Promise<SetUserPasswordState> {
  const session = await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

  const parsed = setUserPasswordSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return { error: "User not found." };

  if (session.role === Role.FACILITIES && user.role !== Role.EMPLOYEE) {
    return { error: "You can only set passwords for employees." };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  revalidatePath("/super-admin/users");
  revalidatePath("/facilities/user-info");
  return { success: true };
}
