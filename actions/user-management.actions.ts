"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { newPasswordField } from "@/lib/validation/schemas";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { hashPassword } from "@/lib/auth/password";
import { audit, auditEntry } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";
import { sendCredentialsEmail, sendCredentialsEmailNow } from "@/lib/mailer";
import { randomBytes } from "node:crypto";
import { mapWithConcurrency } from "@/lib/concurrency";
import { Role, ALL_ROLES, OFFICE_LOCATIONS } from "@/lib/constants/enums";
import {
  sanitizedActionError,
  throwSanitizedError,
  logActionError,
} from "@/lib/actions/action-error";
import {
  ARRIVAL_TIME_OPTIONS,
  NO_TRANSPORT_VALUE,
  normalizeArrivalTimeInput,
} from "@/lib/constants/arrival-times";

/**
 * A fixed arrival time must be one of the overt shuttle window slots
 * (10 PM – 6 AM, whole hours). "not required" / NONE clears it to unset.
 */
function normalizeFixedArrival(
  raw: string
): { value: string | null } | { error: string } {
  const normalized = normalizeArrivalTimeInput(raw);
  if (normalized === null) {
    return {
      error: `Fixed arrival time "${raw}" is not recognized — use labels like "11:00 PM" or "23:00" (10 PM–6 AM), or "not required" to leave it unset.`,
    };
  }
  if (normalized === NO_TRANSPORT_VALUE) return { value: null };
  if (!ARRIVAL_TIME_OPTIONS.some((o) => o.value === normalized)) {
    return {
      error: `Fixed arrival time "${raw}" is outside the shuttle window (10 PM–6 AM).`,
    };
  }
  return { value: normalized };
}

/** Parses one numeric coordinate cell. Blank → null, malformed → NaN. */
function parseCoordinateCell(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : NaN;
}

/** Splits a combined "latitude, longitude" / "latitude longitude" cell. */
function splitCoordPair(pair: string): [number, number] | null {
  const values = pair.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (values.length !== 2 || values.some((n) => !Number.isFinite(n))) return null;
  return [values[0], values[1]];
}

/**
 * Roles Facilities may create, edit, re-credential or delete. Staff accounts
 * (Operations, Facilities, Super Admin) are managed by Super Admin only, so a
 * Facilities user can never mint or take over an elevated account.
 */
const FACILITIES_MANAGEABLE_ROLES: readonly string[] = [
  Role.EMPLOYEE,
  Role.CORPORATE_EMPLOYEE,
  Role.FIXED_ARRIVAL,
];

function canManageRole(actorRole: Role, targetRole: string): boolean {
  if (actorRole === Role.SUPER_ADMIN) return true;
  return FACILITIES_MANAGEABLE_ROLES.includes(targetRole);
}

const STAFF_ACCOUNT_ERROR =
  "Facilities can only manage employee accounts (Employee-MDS, Employee-Corporate, Employee-Corporate(Fixed arrival)).";

/** True for Prisma unique-constraint violations (email / employeeCode races). */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/** Upload guards: Next caps the action body too, these give a clear message. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 2000;

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

  try {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Please enter a valid email address." };
    }
    if (typeof role !== "string" || !isValidRole(role)) {
      return { error: "Please select a valid role." };
    }
    if (!canManageRole(session.role, role)) {
      return { error: STAFF_ACCOUNT_ERROR };
    }
    if (!employeeCode) return { error: "Employee ID is required." };
    if (!department) return { error: "Department is required." };
    if (!contactNumber) return { error: "Contact number is required." };
    if (!/^\d{11}$/.test(contactNumber)) {
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

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
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
          // Admin-chosen passwords are temporary: the user must replace it on
          // first sign-in, so whoever set it can't keep using it.
          mustChangePassword: true,
          isBulkCreated: false,
        },
        select: { id: true, email: true, fullName: true, role: true },
      });

      await auditEntry(
        session,
        {
          action: "CREATE_USER",
          entityType: "User",
          entityId: created.id,
          after: { email: created.email, fullName: created.fullName, role: created.role },
          description: `${session.fullName} created ${created.role} account for ${created.fullName}`,
        },
        tx
      );
      return created;
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
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      logActionError("createUserAction", err);
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
    return sanitizedActionError("createUserAction", err);
  }
}

export type BulkCreateResultRow = { email: string; fullName: string };
export type BulkCreateSkipRow = { line: number; reason: string };
export type BulkCreateUsersState = {
  error?: string;
  results?: {
    created: BulkCreateResultRow[];
    /** Existing accounts refreshed with non-blank CSV values. */
    updatedAccounts: number;
    skipped: BulkCreateSkipRow[];
  };
};

export async function bulkCreateUsersAction(
  _prevState: BulkCreateUsersState,
  formData: FormData
): Promise<BulkCreateUsersState> {
  const session = await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

  try {
    const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "The CSV file is too large (max 2 MB)." };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "The CSV file has no data rows." };
  }
  if (rows.length - 1 > MAX_UPLOAD_ROWS) {
    return {
      error: `The CSV file has too many rows (max ${MAX_UPLOAD_ROWS}). Split it into smaller files.`,
    };
  }

  // Header matching is case/whitespace/punctuation-agnostic ("Home Latitude",
  // "home_latitude", "Lat,Long") so CSV exports beyond the template still map.
  // Home coordinates also accept a single combined column ("23.78, 90.41").
  const normalHeader = (h: string) =>
    h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = rows[0].map(normalHeader);
  const findHeader = (names: readonly string[]): number => {
    for (let i = 0; i < headers.length; i++) {
      if (names.includes(headers[i])) return i;
    }
    return -1;
  };
  const fixedArrivalIdx = (() => {
    const primary = findHeader(["fixedarrivaltime"]);
    return primary !== -1 ? primary : findHeader(["arrivaltime"]);
  })();
  const idx = {
    fullName: findHeader(["fullname", "name"]),
    email: findHeader(["email"]),
    role: findHeader(["role"]),
    employeeCode: findHeader(["employeecode", "employeeid", "empcode"]),
    department: findHeader(["department", "dept"]),
    contactNumber: findHeader(["contactnumber", "contact", "phone", "mobile"]),
    address: findHeader(["address", "homeaddress"]),
    homeLatitude: findHeader(["homelatitude", "homelat", "latitude", "lat"]),
    homeLongitude: findHeader([
      "homelongitude",
      "homelong",
      "longitude",
      "long",
      "lng",
    ]),
    homeCoordinates: findHeader([
      "homelatlong",
      "homelatlongitude",
      "homelatlng",
      "latlong",
      "latlng",
      "latitudelongitude",
      "homecoords",
      "homecoordinates",
      "coords",
      "coordinates",
    ]),
    pickupPoint: findHeader(["pickuppoint", "pickup"]),
    fixedArrivalTime: fixedArrivalIdx,
    password: findHeader(["password"]),
  };
  // Only fullName + email are truly required — an account cannot exist
  // without them. Every other column is optional: blank cells simply leave
  // the profile field empty for Facilities to fill in later.
  if (idx.fullName === -1 || idx.email === -1) {
    return {
      error:
        "CSV must include at least a fullName and email column. role, employeeCode, department, contactNumber, address, pickupPoint, fixedArrivalTime, homeLatitude, homeLongitude, and password are all optional (blank = fill in later; fixedArrivalTime applies to Employee-Corporate(Fixed arrival) rows only).",
    };
  }

    const created: BulkCreateResultRow[] = [];
    const skipped: BulkCreateSkipRow[] = [];
    const employeeCodesInFile = new Set<string>();
    const emailsInFile = new Set<string>();
    const createdCredentials: { email: string; fullName: string; password: string }[] = [];

    // Pre-fetch every existing email / employee ID in TWO queries total
    // (was: two findUnique round trips per row).
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
    const [existingUsers, existingCodeRows] = await Promise.all([
      prisma.user.findMany({
        where: { email: { in: allEmails } },
        select: {
          id: true,
          email: true,
          role: true,
          employeeCode: true,
          fullName: true,
        },
      }),
      prisma.user.findMany({
        where: { employeeCode: { in: allCodes } },
        select: { employeeCode: true, email: true },
      }),
    ]);
    const existingUsersByEmail = new Map(
      existingUsers.map((u) => [u.email.toLowerCase(), u])
    );
    // employeeCode → the email that currently owns it (for conflict checks
    // when a CSV row re-assigns a code).
    const codeOwnerByEmail = new Map(
      existingCodeRows.map((r) => [r.employeeCode, r.email.toLowerCase()])
    );

    // Passwords are hashed lazily, only for rows that actually create an
    // account or set a new password — bcrypt is CPU-bound, so hashing rows
    // that are later skipped (or updates without a password) only blocked
    // the event loop.
    const usersWithRevokedCredentials: string[] = [];

    // employeeCode → owning email, seeded from the DB pre-read and extended
    // as rows claim codes — a code claimed twice in one file becomes a
    // deterministic skip instead of a mid-loop P2002 with partial writes.
    const codeClaims = new Map(codeOwnerByEmail);

    // Phase 1 below only validates + collects: no DB writes, no bcrypt.
    // Phases 2-4 (after the loop) resolve addresses, hash, and write in bulk.
    type ValidatedUserRow =
      | {
          kind: "update";
          line: number;
          userId: string;
          email: string;
          base: {
            fullName?: string;
            role?: Role;
            department?: string;
            contactNumber?: string;
            pickupPoint?: string;
            employeeCode?: string;
            fixedArrivalTime?: string | null;
          };
          roleChanged: boolean;
          password: string | null;
          addressText: string | null;
          withCoords: boolean;
          lat: number;
          lng: number;
        }
      | {
          kind: "create";
          line: number;
          email: string;
          fullName: string;
          role: Role;
          employeeCode: string | null;
          department: string | null;
          contactNumber: string | null;
          addressText: string | null;
          pickupPoint: string | null;
          fixedArrivalTime: string | null | undefined;
          password: string | null;
          withCoords: boolean;
          lat: number;
          lng: number;
        };
    const validOps: ValidatedUserRow[] = [];

    let updatedAccounts = 0;

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cols = rows[i];
    const fullName = cols[idx.fullName]?.trim();
    const email = cols[idx.email]?.trim().toLowerCase();
    const employeeCode = cols[idx.employeeCode]?.trim() || null;
    const department = cols[idx.department]?.trim() || null;
    const contactNumber = cols[idx.contactNumber]?.trim() || null;
    const address = cols[idx.address]?.trim() || null;
    const pickupPoint = cols[idx.pickupPoint]?.trim() || null;
    const password = cols[idx.password]?.trim();

    // Only fullName + email can never be blank — an account cannot exist
    // without them. Every other field is optional: blank = leave empty,
    // Facilities fills it in later.
    if (!fullName || !email) {
      skipped.push({
        line,
        reason: "fullName and email are required to create an account.",
      });
      continue;
    }
    const rawRole = cols[idx.role]?.trim();
    const role = (rawRole || Role.EMPLOYEE).toUpperCase();

    // homeCoordinates are OPTIONAL. Accepted as the split homeLatitude /
    // homeLongitude columns (any casing/spacing) OR one combined column
    // ("23.78, 90.41"). When provided and valid they update the address's
    // coordinates; when absent the address keeps whatever coordinates it
    // already has (or is linked without any for an address text the system
    // has never seen). A partial or malformed pair SKIPS the row with a
    // reason instead of silently dropping the coordinates.
    const latCell = cols[idx.homeLatitude]?.trim();
    const lngCell = cols[idx.homeLongitude]?.trim();
    const coordCell =
      idx.homeCoordinates !== -1 ? cols[idx.homeCoordinates]?.trim() : undefined;

    let homeLatitude: number | null = null;
    let homeLongitude: number | null = null;
    if (idx.homeCoordinates !== -1 && coordCell) {
      const pair = splitCoordPair(coordCell);
      if (!pair) {
        skipped.push({
          line,
          reason: `Coordinates "${coordCell}" must be two numbers — "latitude, longitude".`,
        });
        continue;
      }
      [homeLatitude, homeLongitude] = pair;
    } else if (idx.homeLatitude !== -1 || idx.homeLongitude !== -1) {
      const lat = parseCoordinateCell(latCell);
      const lng = parseCoordinateCell(lngCell);
      if (lat === null && lng === null) {
        // both blank → no coordinates for this row
      } else if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
        skipped.push({
          line,
          reason: `homeLatitude and homeLongitude must both be numbers (got "${latCell ?? ""}" / "${lngCell ?? ""}").`,
        });
        continue;
      }
      homeLatitude = lat;
      homeLongitude = lng;
    }
    const hasCoords = homeLatitude !== null && homeLongitude !== null;
    const coordLat = homeLatitude ?? 0;
    const coordLng = homeLongitude ?? 0;

    if (!isValidRole(role)) {
      skipped.push({ line, reason: `Unknown role "${cols[idx.role]?.trim()}".` });
      continue;
    }
    if (!canManageRole(session.role, role)) {
      skipped.push({ line, reason: STAFF_ACCOUNT_ERROR });
      continue;
    }

    // Fixed arrival time is only meaningful for FIXED_ARRIVAL roles. A blank
    // cell is ignored; a real time is validated against the 10 PM–6 AM
    // shuttle window; "not required" / NONE clears any existing value.
    const rawArrival = cols[idx.fixedArrivalTime]?.trim();
    let fixedArrivalTime: string | null | undefined = undefined;
    if (rawArrival) {
      const result = normalizeFixedArrival(rawArrival);
      if ("error" in result) {
        skipped.push({ line, reason: result.error });
        continue;
      }
      if (role === Role.FIXED_ARRIVAL) {
        fixedArrivalTime = result.value;
      } else if (result.value !== null) {
        skipped.push({
          line,
          reason: `fixedArrivalTime only applies to the FIXED_ARRIVAL role.`,
        });
        continue;
      }
      // For non-FIXED_ARRIVAL rows with "not required" / NONE → silently
      // ignore (the cell is meaningless for this role).
    }

    if (password && password.length < 8) {
      skipped.push({
        line,
        reason:
          "Password must be at least 8 characters (or leave it blank for a generated temporary password).",
      });
      continue;
    }
    if (hasCoords && (Math.abs(coordLat) > 90 || Math.abs(coordLng) > 180)) {
      skipped.push({ line, reason: "Home latitude must be -90 to 90 and longitude -180 to 180." });
      continue;
    }

    if (emailsInFile.has(email)) {
      skipped.push({ line, reason: `Email ${email} is duplicated in this CSV file.` });
      continue;
    }
    if (employeeCode && employeeCodesInFile.has(employeeCode)) {
      skipped.push({ line, reason: `Employee ID ${employeeCode} is duplicated in this CSV file.` });
      continue;
    }

    // ── UPDATE path: the account already exists ─────────────────────────
    // Non-blank CSV cells refresh the profile; blank cells keep the current
    // value as it is. Blank lat/long never overwrites coordinates.
    const existingUser = existingUsersByEmail.get(email);
    if (existingUser) {
      if (!canManageRole(session.role, existingUser.role)) {
        skipped.push({ line, reason: STAFF_ACCOUNT_ERROR });
        continue;
      }
      const updates: {
        fullName?: string;
        role?: Role;
        department?: string;
        contactNumber?: string;
        pickupPoint?: string;
        employeeCode?: string;
        passwordHash?: string;
        mustChangePassword?: boolean;
        address?: string;
        homeAddressId?: string;
        fixedArrivalTime?: string | null;
      } = {};
      if (fullName && fullName !== existingUser.fullName) updates.fullName = fullName;
      if (rawRole && role !== existingUser.role) updates.role = role;
      if (department) updates.department = department;
      if (contactNumber) updates.contactNumber = contactNumber;
      if (pickupPoint) updates.pickupPoint = pickupPoint;
      if (fixedArrivalTime !== undefined) updates.fixedArrivalTime = fixedArrivalTime;
      if (employeeCode && employeeCode !== existingUser.employeeCode) {
        const owner = codeClaims.get(employeeCode);
        if (owner && owner !== email) {
          skipped.push({
            line,
            reason: `Employee ID ${employeeCode} already belongs to another account.`,
          });
          continue;
        }
        updates.employeeCode = employeeCode;
      }
      if (updates.employeeCode) codeClaims.set(updates.employeeCode, email);
      else if (existingUser.employeeCode) codeClaims.set(existingUser.employeeCode, email);
      // Collect-only: password hashing and the address link + user update
      // happen in the batched phases below, not one row at a time here.
      // (password/address keys are attached by phase 4 — `updates` only
      // carries profile fields at this point.)
      validOps.push({
        kind: "update",
        line,
        userId: existingUser.id,
        email,
        base: updates,
        roleChanged: Boolean(updates.role),
        password: password || null,
        addressText: address,
        withCoords: hasCoords,
        lat: coordLat,
        lng: coordLng,
      });
      emailsInFile.add(email);
      continue;
    }

    // A code already owned (DB snapshot or claimed by an earlier row) can
    // never insert — skip eagerly with the same message the old P2002 catch
    // produced, instead of failing the whole batch at write time.
    if (employeeCode) {
      if (codeClaims.has(employeeCode)) {
        skipped.push({ line, reason: `Email or employee ID already exists (${email}, ${employeeCode}).` });
        continue;
      }
      codeClaims.set(employeeCode, email);
    }

    // Collect-only: password generation/hashing and the address link +
    // user create happen in the batched phases below.
    validOps.push({
      kind: "create",
      line,
      email,
      fullName,
      role,
      employeeCode,
      department,
      contactNumber,
      addressText: address,
      pickupPoint,
      fixedArrivalTime: fixedArrivalTime ?? undefined,
      password: password || null,
      withCoords: hasCoords,
      lat: coordLat,
      lng: coordLng,
    });
    emailsInFile.add(email);
    if (employeeCode) employeeCodesInFile.add(employeeCode);
  }

  // ── Phase 2: resolve addresses in bulk ───────────────────────────────
  // One statement per UNIQUE address text (was: an upsert/findUnique per
  // row). A text WITH coordinates keeps the LAST row's pair — the old serial
  // loop ended with the last writer's values. A text never given coordinates
  // links the existing row untouched, or null for brand-new text.
  const lastCoordsByText = new Map<string, { lat: number; lng: number }>();
  const linkedTexts = new Set<string>();
  for (const op of validOps) {
    if (!op.addressText) continue;
    linkedTexts.add(op.addressText);
    if (op.withCoords) lastCoordsByText.set(op.addressText, { lat: op.lat, lng: op.lng });
  }
  const plainTexts = [...linkedTexts].filter((t) => !lastCoordsByText.has(t));
  const resolvedAddressIds = new Map<string, string | null>();
  if (plainTexts.length > 0) {
    for (const a of await prisma.address.findMany({
      where: { addressText: { in: plainTexts } },
      select: { id: true, addressText: true },
    })) {
      resolvedAddressIds.set(a.addressText, a.id);
    }
  }
  await mapWithConcurrency([...lastCoordsByText], 8, async ([text, coords]) => {
    const row = await prisma.address.upsert({
      where: { addressText: text },
      update: { latitude: coords.lat, longitude: coords.lng },
      create: { addressText: text, latitude: coords.lat, longitude: coords.lng },
    });
    resolvedAddressIds.set(text, row.id);
  });

  // ── Phase 3: hash passwords with bounded concurrency ─────────────────
  // bcrypt is CPU-bound (~80 ms/row serially). Hashed under a small cap:
  // bcryptjs yields between blocks, so a low limit overlaps the work without
  // starving the event loop — never an unbounded fan-out.
  const hashTargets: { index: number; plain: string }[] = [];
  const createPlainByIndex = new Map<number, string>();
  validOps.forEach((op, index) => {
    if (op.kind === "update") {
      if (op.password) hashTargets.push({ index, plain: op.password });
    } else {
      // Blank password → a random temporary one is generated and emailed;
      // the user must change it after logging in.
      const plain = op.password || `Tmp-${randomBytes(6).toString("base64url")}`;
      createPlainByIndex.set(index, plain);
      hashTargets.push({ index, plain });
    }
  });
  const passwordHashByIndex = new Map<number, string>();
  await mapWithConcurrency(hashTargets, 4, async (t) => ({
    index: t.index,
    hash: await hashPassword(t.plain),
  })).then((hashed) => {
    for (const h of hashed) passwordHashByIndex.set(h.index, h.hash);
  });

  // ── Phase 4: write users ─────────────────────────────────────────────
  // Updates carry distinct per-row data — individual statements, but
  // bounded-parallel instead of serial.
  await mapWithConcurrency(
    validOps.map((op, index) => ({ op, index })).filter((x) => x.op.kind === "update"),
    8,
    async ({ op, index }) => {
      if (op.kind !== "update") return;
      const data: {
        fullName?: string;
        role?: Role;
        department?: string;
        contactNumber?: string;
        pickupPoint?: string;
        employeeCode?: string;
        fixedArrivalTime?: string | null;
        address?: string;
        homeAddressId?: string;
        passwordHash?: string;
        mustChangePassword?: boolean;
      } = { ...op.base };
      if (op.addressText) {
        data.address = op.addressText;
        const linked = resolvedAddressIds.get(op.addressText) ?? null;
        if (linked) data.homeAddressId = linked;
      }
      const hash = passwordHashByIndex.get(index);
      if (hash) {
        data.passwordHash = hash;
        data.mustChangePassword = true;
      }
      if (Object.keys(data).length === 0) return;
      await prisma.user.update({
        where: { id: op.userId },
        data,
        select: { id: true },
      });
      if (hash || op.roleChanged) usersWithRevokedCredentials.push(op.userId);
      updatedAccounts += 1;
    }
  );

  // Creates share no per-row logic — a single INSERT for the whole file
  // (was: one create round trip per row). A P2002 here means a concurrent
  // writer inserted the same email/code after our pre-read: fall back to
  // per-row creates so the file still lands with the old per-row skip
  // accounting instead of failing the entire upload.
  type CreateEntry = {
    op: Extract<ValidatedUserRow, { kind: "create" }>;
    plain: string;
    data: {
      email: string;
      fullName: string;
      role: Role;
      employeeCode: string | null;
      department: string | null;
      contactNumber: string | null;
      address: string | null;
      homeAddressId: string | null;
      pickupPoint: string | null;
      passwordHash: string;
      mustChangePassword: boolean;
      isBulkCreated: boolean;
      fixedArrivalTime?: string | null;
    };
  };
  const createEntries: CreateEntry[] = [];
  validOps.forEach((op, index) => {
    if (op.kind !== "create") return;
    const hash = passwordHashByIndex.get(index);
    const plain = createPlainByIndex.get(index);
    if (!hash || !plain) {
      throw new Error("Password hashing failed for a bulk-upload row. Retry the upload.");
    }
    createEntries.push({
      op,
      plain,
      data: {
        email: op.email,
        fullName: op.fullName,
        role: op.role,
        employeeCode: op.employeeCode,
        department: op.department,
        contactNumber: op.contactNumber,
        address: op.addressText,
        homeAddressId: op.addressText ? (resolvedAddressIds.get(op.addressText) ?? null) : null,
        pickupPoint: op.pickupPoint,
        passwordHash: hash,
        mustChangePassword: true,
        isBulkCreated: true,
        fixedArrivalTime: op.fixedArrivalTime ?? undefined,
      },
    });
  });
  const recordCreated = (entry: CreateEntry) => {
    created.push({ email: entry.op.email, fullName: entry.op.fullName });
    createdCredentials.push({
      email: entry.op.email,
      fullName: entry.op.fullName,
      // The plain password that was actually hashed — a provided one, or the
      // generated temporary one when the CSV cell was blank.
      password: entry.plain,
    });
  };
  if (createEntries.length > 0) {
    try {
      await prisma.user.createMany({ data: createEntries.map((e) => e.data) });
      for (const e of createEntries) recordCreated(e);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      for (const e of createEntries) {
        try {
          await prisma.user.create({ data: e.data });
        } catch (rowError) {
          if (isDuplicateKeyError(rowError)) {
            skipped.push({ line: e.op.line, reason: `Email or employee ID already exists (${e.op.email}, ${e.op.employeeCode}).` });
            continue;
          }
          throw rowError;
        }
        recordCreated(e);
      }
    }
  }

  // Credential/role changes invalidate the affected users' sessions.
  if (usersWithRevokedCredentials.length > 0) {
    await prisma.session.deleteMany({
      where: { userId: { in: usersWithRevokedCredentials } },
    });
  }

  await audit(session, {
    action: "BULK_UPSERT_USERS",
    entityType: "User",
    after: {
      created: created.map((c) => c.email),
      updatedAccounts,
      skipped: skipped.length,
    },
    description: `${session.fullName} bulk-uploaded users: ${created.length} created, ${updatedAccounts} updated, ${skipped.length} skipped`,
  });

  // Sequential sends over the pooled transporter keep the SMTP provider from
  // throttling a burst of simultaneous connections.
  after(async () => {
    for (const c of createdCredentials) {
      await sendCredentialsEmail({ to: c.email, fullName: c.fullName, password: c.password });
    }
  });

  revalidatePath("/super-admin/users");
  revalidatePath("/facilities/user-info");
  return { results: { created, updatedAccounts, skipped } };
  } catch (err) {
    return sanitizedActionError(
      "bulkCreateUsersAction",
      err,
      "An unexpected error occurred during bulk upload."
    );
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
  const session = await requireRole([Role.SUPER_ADMIN, Role.FACILITIES]);

  try {
    const userId = formData.get("userId");
    if (typeof userId !== "string" || !userId) {
      return { error: "Missing user." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, isActive: true, role: true },
    });
    if (!user) return { error: "User not found." };
    if (!canManageRole(session.role, user.role)) {
      return { error: STAFF_ACCOUNT_ERROR };
    }
    if (!user.isActive) {
      return { error: "This account is deactivated — activate it first." };
    }

    const tempPassword = `Tmp-${randomBytes(6).toString("base64url")}`;
    const passwordHash = await hashPassword(tempPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: true },
        select: { id: true },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      auditEntry(session, {
        action: "RESEND_CREDENTIALS",
        entityType: "User",
        entityId: user.id,
        description: `${session.fullName} issued new temporary credentials to ${user.fullName}`,
      }),
    ]);

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
    return sanitizedActionError(
      "resendCredentialsAction",
      err,
      "Failed to resend credentials. Please try again."
    );
  }
}

export type UpdateUserRoleState = { error?: string; success?: boolean };

export async function updateUserRoleAction(
  _prevState: UpdateUserRoleState,
  formData: FormData
): Promise<UpdateUserRoleState> {
  const session = await requireRole([Role.SUPER_ADMIN]);

  try {
    const id = formData.get("id");
    const role = formData.get("role");
    if (typeof id !== "string" || !id) return { error: "Missing user." };
    if (typeof role !== "string" || !isValidRole(role)) {
      return { error: "Please select a valid role." };
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, fullName: true },
    });
    if (!user) return { error: "User not found." };

    if (user.id === session.id && role !== user.role) {
      return { error: "You can't change your own role." };
    }
    if (user.role === role) {
      return { success: true };
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { role }, select: { id: true } }),
      // Sessions carry the role claim — force a fresh sign-in.
      prisma.session.deleteMany({ where: { userId: id } }),
      auditEntry(session, {
        action: "UPDATE_USER_ROLE",
        entityType: "User",
        entityId: id,
        before: { role: user.role },
        after: { role },
        description: `${session.fullName} changed ${user.fullName}'s role from ${user.role} to ${role}`,
      }),
    ]);

    revalidatePath("/super-admin/users");
    return { success: true };
  } catch (error) {
    return sanitizedActionError("updateUserRoleAction", error);
  }
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.SUPER_ADMIN]);

  try {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) return;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true, fullName: true },
    });
    if (!user || user.id === session.id) return;

    const nextActive = !user.isActive;
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          isActive: nextActive,
          deletedAt: nextActive ? null : new Date(),
          deletedBy: nextActive ? null : session.id,
        },
        select: { id: true },
      }),
      prisma.session.deleteMany({ where: { userId: id } }),
      auditEntry(session, {
        action: nextActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        entityType: "User",
        entityId: id,
        before: { isActive: user.isActive },
        after: { isActive: nextActive },
        description: `${session.fullName} ${nextActive ? "activated" : "deactivated"} ${user.fullName}`,
      }),
    ]);

    revalidatePath("/super-admin/users");
  } catch (error) {
    throwSanitizedError("toggleUserActiveAction", error);
  }
}

const setUserPasswordSchema = z
  .object({
    userId: z.string().min(1, "Missing user."),
    newPassword: newPasswordField,
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

  try {
    const parsed = setUserPasswordSchema.safeParse({
      userId: formData.get("userId"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, role: true, fullName: true },
    });
    if (!user) return { error: "User not found." };

    if (!canManageRole(session.role, user.role)) {
      return { error: STAFF_ACCOUNT_ERROR };
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: true },
        select: { id: true },
      }),
      // Old sessions may belong to whoever knew the previous password.
      prisma.session.deleteMany({ where: { userId: user.id } }),
      auditEntry(session, {
        action: "SET_USER_PASSWORD",
        entityType: "User",
        entityId: user.id,
        description: `${session.fullName} set a new password for ${user.fullName}`,
      }),
    ]);

    revalidatePath("/super-admin/users");
    revalidatePath("/facilities/user-info");
    return { success: true };
  } catch (error) {
    return sanitizedActionError("setUserPasswordAction", error);
  }
}

export type DeleteUserState = { error?: string; success?: boolean };

/**
 * Permanently removes a user account and ALL of their data from the system.
 *
 * Ordered transaction deletes (child rows whose `onDelete` is the Prisma
 * default `Restrict` must go first):
 *  - Session              (user, required, Restrict)
 *  - WeeklyScheduleDay    (→ WeeklySchedule, Restrict)
 *  - WeeklySchedule       (employee, required, Restrict)
 *  - AddressChangeRequest / ContactChangeRequest / PickupPointChangeRequest
 *                         (employee, required, Restrict)
 *  - AdHocRequest         (employee, required, Restrict)
 *  - ManualRoutePlanEntry (employee, required, Restrict)
 * The final `user.delete` auto-cascades TripAssignment (onDelete: Cascade) and
 * auto-SetNulls RouteTemplateStop.employee plus the `reviewedBy` reviewer
 * relations (optional relations default to SetNull). RoutePlanOverride stores
 * `changedById` as a plain string (no FK) so history rows survive the delete.
 */
export async function deleteUserAction(
  _prevState: DeleteUserState,
  formData: FormData
): Promise<DeleteUserState> {
  const actor = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const userId = formData.get("userId");
    if (typeof userId !== "string" || !userId) {
      return { error: "Missing user." };
    }
    if (userId === actor.id) {
      return { error: "You cannot delete your own account." };
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, fullName: true },
    });
    if (!target) return { error: "User not found." };
    if (target.role === Role.SUPER_ADMIN) {
      return { error: "Super Admin accounts cannot be deleted." };
    }
    if (!canManageRole(actor.role, target.role)) {
      return { error: STAFF_ACCOUNT_ERROR };
    }

    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.weeklyScheduleDay.deleteMany({
        where: { weeklySchedule: { employeeId: userId } },
      }),
      prisma.weeklySchedule.deleteMany({ where: { employeeId: userId } }),
      prisma.addressChangeRequest.deleteMany({ where: { employeeId: userId } }),
      prisma.contactChangeRequest.deleteMany({ where: { employeeId: userId } }),
      prisma.pickupPointChangeRequest.deleteMany({ where: { employeeId: userId } }),
      prisma.adHocRequest.deleteMany({ where: { employeeId: userId } }),
      prisma.manualRoutePlanEntry.deleteMany({ where: { employeeId: userId } }),
      prisma.user.delete({ where: { id: userId }, select: { id: true } }),
      auditEntry(actor, {
        action: "DELETE_USER",
        entityType: "User",
        entityId: userId,
        before: { fullName: target.fullName, role: target.role },
        description: `${actor.fullName} permanently deleted ${target.fullName} (${target.role})`,
      }),
    ]);

    revalidatePath("/facilities/user-info");
    revalidatePath("/super-admin/users");
    return { success: true };
  } catch (error) {
    return sanitizedActionError("deleteUserAction", error);
  }
}
