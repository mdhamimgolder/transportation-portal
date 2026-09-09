"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { hashPassword } from "@/lib/auth/password";
import { parseCsv } from "@/lib/csv";
import { sendCredentialsEmail, sendCredentialsEmailNow } from "@/lib/mailer";
import { randomBytes } from "node:crypto";
import { Role, ALL_ROLES, OFFICE_LOCATIONS } from "@/lib/constants/enums";

/**
 * TEST MODE (local only): the email/contact-number format checks below are
 * skipped outside production so multiple dummy test accounts can be created
 * locally via `next dev`. On Vercel NODE_ENV=production → validation fully on.
 * TODO: remove this test-mode flag before relying on validation again.
 */
const IS_PROD = process.env.NODE_ENV === "production";

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
  try {
    const session = await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

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
    if (IS_PROD && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Please enter a valid email address." };
    }
    if (typeof role !== "string" || !isValidRole(role)) {
      return { error: "Please select a valid role." };
    }
    if (session.role === Role.FACILITIES && role === Role.SUPER_ADMIN) {
      return { error: "Facilities cannot create Super Admin accounts." };
    }
    if (!employeeCode) return { error: "Employee ID is required." };
    if (!department) return { error: "Department is required." };
    if (!contactNumber) return { error: "Contact number is required." };
    if (IS_PROD && !/^\d{11}$/.test(contactNumber)) {
      return { error: "Contact number must be exactly 11 digits." };
    }
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

    after(async () => {
      await sendCredentialsEmail({
        to: normalizedEmail,
        fullName,
        password,
      });
    });

    revalidatePath("/super-admin/users");
    revalidatePath("/facilities/user-info");
    return { created: { email: user.email, fullName: user.fullName } };
  } catch (err) {
    console.error("[createUserAction]", err);
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      const meta = (err as { meta?: { target?: string[] } }).meta;
      const target = meta?.target ?? [];
      if (target.includes("employeeCode")) {
        return { error: "An employee with this Employee ID already exists." };
      }
      if (target.includes("email")) {
        return { error: "A user with this email already exists." };
      }
      return { error: "A record with that value already exists." };
    }
    const message =
      err && typeof err === "object" && "message" in err
        ? String(err.message)
        : "An unexpected error occurred. Please try again.";
    return { error: message };
  }
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
  try {
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
    department: colIndex("department"),
    contactNumber: colIndex("contactnumber"),
    address: colIndex("address"),
    homeLatitude: colIndex("homelatitude"),
    homeLongitude: colIndex("homelongitude"),
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
        "CSV must include fullName, email, role, employeeCode, department, contactNumber, address, pickupPoint, and password columns. homeLatitude and homeLongitude are optional.",
    };
  }

    const created: BulkCreateResultRow[] = [];
    const skipped: BulkCreateSkipRow[] = [];
    const employeeCodesInFile = new Set<string>();
    const emailsInFile = new Set<string>();
    const createdCredentials: { email: string; fullName: string; password: string }[] = [];

    // Pre-fetch every existing email / employee ID in TWO queries total
    // (was: two findUnique round trips per row), and pre-hash every password
    // in PARALLEL (bcrypt was awaited serially, ~100ms per row).
    const allEmails = [
      ...new Set(
        rows
          .slice(1)
          .map((cols) => (cols[idx.email] ?? "").trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
    const allCodes = [
      ...new Set(
        rows
          .slice(1)
          .map((cols) => (cols[idx.employeeCode] ?? "").trim())
          .filter(Boolean)
      ),
    ];
    const [existingEmailRows, existingCodeRows] = await Promise.all([
      prisma.user.findMany({ where: { email: { in: allEmails } }, select: { email: true } }),
      prisma.user.findMany({
        where: { employeeCode: { in: allCodes } },
        select: { employeeCode: true },
      }),
    ]);
    const existingEmailSet = new Set(existingEmailRows.map((r) => r.email));
    const existingCodeSet = new Set(existingCodeRows.map((r) => r.employeeCode));

    const passwordHashByLine = new Map<number, string>();
    await Promise.all(
      rows.slice(1).map(async (cols, j) => {
        const pw = (cols[idx.password] ?? "").trim();
        if (pw) passwordHashByLine.set(j + 2, await hashPassword(pw));
      })
    );

    // One address upsert per UNIQUE address text + coordinate variant (was:
    // per row). Coordinates optional — see the hasCoords comment above.
    const addressIds = new Map<string, string | null>();

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
    const homeLatitude = Number(cols[idx.homeLatitude]?.trim());
    const homeLongitude = Number(cols[idx.homeLongitude]?.trim());
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
        reason: "Missing required fields.",
      });
      continue;
    }

    // homeLatitude / homeLongitude are OPTIONAL. When both are provided and
    // valid they update the address's coordinates; when absent the address
    // keeps whatever coordinates it already has (or is linked without any for
    // an address text the system has never seen).
    const hasCoords =
      Number.isFinite(homeLatitude) && Number.isFinite(homeLongitude);

    if (!isValidRole(role)) {
      skipped.push({ line, reason: `Unknown role "${role}".` });
      continue;
    }
    if (session.role === Role.FACILITIES && role === Role.SUPER_ADMIN) {
      skipped.push({ line, reason: "Facilities cannot create Super Admin accounts." });
      continue;
    }
    if (password.length < 8) {
      skipped.push({ line, reason: "Password must be at least 8 characters." });
      continue;
    }
    if (hasCoords && (Math.abs(homeLatitude) > 90 || Math.abs(homeLongitude) > 180)) {
      skipped.push({ line, reason: "Home latitude must be -90 to 90 and longitude -180 to 180." });
      continue;
    }

    if (emailsInFile.has(email)) {
      skipped.push({ line, reason: `Email ${email} is duplicated in this CSV file.` });
      continue;
    }
    if (employeeCodesInFile.has(employeeCode)) {
      skipped.push({ line, reason: `Employee ID ${employeeCode} is duplicated in this CSV file.` });
      continue;
    }

    if (existingEmailSet.has(email)) {
      skipped.push({ line, reason: `Email ${email} already exists.` });
      continue;
    }
    if (existingCodeSet.has(employeeCode)) {
      skipped.push({ line, reason: `Employee ID ${employeeCode} already exists.` });
      continue;
    }

    const passwordHash = passwordHashByLine.get(line) ?? (await hashPassword(password));
    const coordKey = hasCoords ? `${homeLatitude},${homeLongitude}` : "keep-as-is";
    const cacheKey = `${address}::${coordKey}`;
    let homeAddressId: string | null;
    if (addressIds.has(cacheKey)) {
      homeAddressId = addressIds.get(cacheKey) ?? null;
    } else if (hasCoords) {
      const homeAddress = await prisma.address.upsert({
        where: { addressText: address },
        update: { latitude: homeLatitude, longitude: homeLongitude },
        create: { addressText: address, latitude: homeLatitude, longitude: homeLongitude },
      });
      homeAddressId = homeAddress.id;
      addressIds.set(cacheKey, homeAddressId);
    } else {
      // No coordinates provided: link the existing address untouched, or
      // skip linking entirely for a brand-new address text (the profile is
      // still created with the address text).
      homeAddressId =
        (await prisma.address.findUnique({ where: { addressText: address } }))?.id ?? null;
      addressIds.set(cacheKey, homeAddressId);
    }

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email,
          fullName,
          role,
          employeeCode,
          department,
          contactNumber,
          address,
          homeAddressId,
          pickupPoint,
          passwordHash,
          mustChangePassword: false,
          isBulkCreated: true,
        },
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        skipped.push({ line, reason: `Email or employee ID already exists (${email}, ${employeeCode}).` });
        continue;
      }
      throw error;
    }

    created.push({ email: user.email, fullName: user.fullName });
    createdCredentials.push({ email: user.email, fullName: user.fullName, password });
    emailsInFile.add(email);
    employeeCodesInFile.add(employeeCode);
  }

  after(async () => {
    await Promise.allSettled(
      createdCredentials.map((c) =>
        sendCredentialsEmail({ to: c.email, fullName: c.fullName, password: c.password })
      )
    );
  });

  revalidatePath("/super-admin/users");
  revalidatePath("/facilities/user-info");
  return { results: { created, skipped } };
  } catch (err) {
    console.error("[bulkCreateUsersAction]", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? String(err.message)
        : "An unexpected error occurred during bulk upload.";
    return { error: message };
  }
}

export type ResendCredentialsState = {
  error?: string;
  result?: {
    email: string;
    status: "sent" | "skipped-dev" | "failed";
    error?: string;
  };
};

/**
 * Re-issue credentials for an existing account: sets a fresh temporary
 * password (the original plaintext was never stored, so it cannot be resent),
 * forces a password change on next login, and emails the new credentials.
 * Unlike the create-flow email, this returns the REAL send result so SMTP
 * problems (missing env vars, bad app password, …) are visible.
 */
export async function resendCredentialsAction(
  _prevState: ResendCredentialsState,
  formData: FormData
): Promise<ResendCredentialsState> {
  try {
    await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

    const userId = formData.get("userId");
    if (typeof userId !== "string" || !userId) {
      return { error: "Missing user." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, isActive: true },
    });
    if (!user) return { error: "User not found." };
    if (!user.isActive) {
      return { error: "This account is deactivated — activate it first." };
    }

    const tempPassword = `Tmp-${randomBytes(6).toString("base64url")}`;
    const passwordHash = await hashPassword(tempPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true },
    });

    const outcome = await sendCredentialsEmailNow({
      to: user.email,
      fullName: user.fullName,
      password: tempPassword,
    });

    revalidatePath("/facilities/user-info");
    revalidatePath("/super-admin/users");

    return {
      result: {
        email: user.email,
        status: outcome.status,
        error: outcome.error,
      },
    };
  } catch (err) {
    console.error("[resendCredentialsAction]", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to resend credentials. Please try again.",
    };
  }
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
