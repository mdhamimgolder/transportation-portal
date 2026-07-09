"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import { hashPassword } from "@/lib/auth/password";
import { parseCsv } from "@/lib/csv";
import { Role, ALL_ROLES, AuditActionType } from "@/lib/constants/enums";

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
  const session = await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

  const fullName = requiredField(formData, "fullName");
  const email = requiredField(formData, "email");
  const role = formData.get("role");
  const employeeCode = requiredField(formData, "employeeCode");
  const contactNumber = requiredField(formData, "contactNumber");
  const address = requiredField(formData, "address");
  const pickupPoint = requiredField(formData, "pickupPoint");
  const password = requiredField(formData, "password");

  if (!fullName) return { error: "Full name is required." };
  if (!email) return { error: "Email is required." };
  if (typeof role !== "string" || !isValidRole(role)) {
    return { error: "Please select a valid role." };
  }
  if (!employeeCode) return { error: "Employee ID is required." };
  if (!contactNumber) return { error: "Contact number is required." };
  if (!address) return { error: "Address is required." };
  if (!pickupPoint) return { error: "Pick-up point is required." };
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
      contactNumber,
      address,
      pickupPoint,
      passwordHash,
      mustChangePassword: false,
      isBulkCreated: false,
    },
  });

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.USER_CREATED,
    entityType: "User",
    entityId: user.id,
    after: { email: user.email, role: user.role, fullName: user.fullName },
    description: `${session.fullName} created a ${role} account for ${user.fullName}`,
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
  const session = await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

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
    idx.contactNumber === -1 ||
    idx.address === -1 ||
    idx.pickupPoint === -1 ||
    idx.password === -1
  ) {
    return {
      error:
        "CSV must include fullName, email, role, employeeCode, contactNumber, address, pickupPoint, and password columns.",
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
    const contactNumber = cols[idx.contactNumber]?.trim();
    const address = cols[idx.address]?.trim();
    const pickupPoint = cols[idx.pickupPoint]?.trim();
    const password = cols[idx.password]?.trim();

    if (
      !fullName ||
      !email ||
      !role ||
      !employeeCode ||
      !contactNumber ||
      !address ||
      !pickupPoint ||
      !password
    ) {
      skipped.push({
        line,
        reason:
          "Missing one or more required fields (fullName, email, role, employeeCode, contactNumber, address, pickupPoint, password).",
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

  if (created.length > 0) {
    await writeAuditLog({
      actor: { id: session.id, email: session.email, role: session.role },
      actionType: AuditActionType.USER_BULK_CREATED,
      entityType: "User",
      entityId: "bulk",
      after: { count: created.length },
      description: `${session.fullName} bulk-created ${created.length} account(s)`,
    });
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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.USER_ROLE_CHANGED,
    entityType: "User",
    entityId: id,
    before: { role: user.role },
    after: { role },
    description: `${session.fullName} changed ${user.fullName}'s role from ${user.role} to ${role}`,
  });

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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: nextActive
      ? AuditActionType.USER_REACTIVATED
      : AuditActionType.USER_DEACTIVATED,
    entityType: "User",
    entityId: id,
    description: `${session.fullName} ${nextActive ? "reactivated" : "deactivated"} ${user.fullName}`,
  });

  revalidatePath("/super-admin/users");
}
