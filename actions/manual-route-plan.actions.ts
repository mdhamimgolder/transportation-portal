"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { parseCsv } from "@/lib/csv";
import {
  parseClockTime,
  shiftKeyForShiftLabel,
} from "@/lib/routing/manual-plan-training";
import {
  trainRoutePlannerFromHistory,
  type LearnFromHistoryResult,
} from "@/actions/route-learning.actions";

/**
 * "Teach from manual plan" — ingest a MANUALLY made route plan as CSV.
 *
 * Every row is one employee's pickup on a date/shift/vehicle. Rows are stored
 * raw in `ManualRoutePlanEntry` (idempotent upsert per
 * date+shift+vehicle+employee, so re-uploading a corrected file replaces the
 * old rows) and then the full learned set is rebuilt via
 * `trainRoutePlannerFromHistory`, which merges the manual rows into
 * `RouteLegLearning` alongside mined history. From the next RUN MAPPING on,
 * the planner plans pick-up times from those real, hand-tuned gaps instead of
 * the generic 5 min/km estimate.
 */

export type ManualPlanImportSkip = { line: number; reason: string };

export type ManualPlanImportState = {
  error?: string;
  results?: {
    stored: number;
    updated: number;
    skipped: ManualPlanImportSkip[];
    learning?: LearnFromHistoryResult;
  };
};

/** Header cells are matched case/space/punctuation-insensitively. */
function headerKey(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const REQUIRED_HEADERS = [
  "date",
  "shift",
  "vehiclenumber",
  "employeeemail",
  "pickuptime",
  "officearrival",
] as const;

function toDateUtcMidnight(raw: string): Date | null {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOffice(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  return value ? value : "Regnum";
}

export async function importManualRoutePlanCsv(
  _prevState: ManualPlanImportState,
  formData: FormData
): Promise<ManualPlanImportState> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }

  const rows = parseCsv(await file.text());
  if (rows.length < 2) {
    return { error: "The CSV must have a header row and at least one data row." };
  }

  const idx = new Map<string, number>();
  rows[0].forEach((cell, i) => {
    const key = headerKey(cell);
    if (key && !idx.has(key)) idx.set(key, i);
  });
  const missing = REQUIRED_HEADERS.filter((h) => !idx.has(h));
  if (missing.length > 0) {
    return {
      error: `Missing required column(s): ${missing.join(", ")}. Download the template for the exact format.`,
    };
  }

  type ParsedRow = {
    line: number;
    date: Date;
    shiftKey: string;
    vehicleNumber: string;
    email: string;
    name: string;
    pickupPoint: string;
    pickupMinutes: number;
    orderIndex: number | null;
    office: string;
    arrivalMinutes: number;
  };
  const parsed: ParsedRow[] = [];
  const skipped: ManualPlanImportSkip[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    const cell = (header: string) => (row[idx.get(headerKey(header))!] ?? "").trim();

    const date = toDateUtcMidnight(cell("date"));
    if (!date) {
      skipped.push({ line, reason: "date must be YYYY-MM-DD" });
      continue;
    }
    const shiftKey = shiftKeyForShiftLabel(cell("shift"));
    if (!shiftKey) {
      skipped.push({ line, reason: `unknown shift "${cell("shift")}" (use 10 PM, 11 PM, 12 AM…6 AM)` });
      continue;
    }
    const vehicleNumber = cell("vehicleNumber");
    if (!vehicleNumber) {
      skipped.push({ line, reason: "vehicleNumber is required (groups the rows into one vehicle run)" });
      continue;
    }
    const email = cell("employeeemail").toLowerCase();
    const name = cell("employeename");
    if (!email && !name) {
      skipped.push({ line, reason: "employeeEmail (or employeeName) is required" });
      continue;
    }
    const pickupMinutes = parseClockTime(cell("pickuptime"));
    if (pickupMinutes === null) {
      skipped.push({ line, reason: `invalid pickupTime "${cell("pickuptime")}" (use HH:mm or h:mm AM/PM)` });
      continue;
    }
    const arrivalRaw = cell("officearrival");
    const arrivalMinutes = parseClockTime(arrivalRaw);
    if (arrivalMinutes === null) {
      skipped.push({ line, reason: `invalid officeArrival "${arrivalRaw}" (use HH:mm or h:mm AM/PM)` });
      continue;
    }
    const orderRaw = cell("visitorder");
    const orderIndex = orderRaw ? Number.parseInt(orderRaw, 10) : null;
    if (orderRaw && (orderIndex === null || !Number.isFinite(orderIndex))) {
      skipped.push({ line, reason: `invalid visitOrder "${orderRaw}"` });
      continue;
    }

    const candidate: ParsedRow = {
      line,
      date,
      shiftKey,
      vehicleNumber,
      email,
      name,
      pickupPoint: cell("pickupPoint"),
      pickupMinutes,
      orderIndex: orderIndex !== null && Number.isFinite(orderIndex) ? orderIndex : null,
      office: cell("office"),
      arrivalMinutes,
    };
    parsed.push(candidate);
  }

  // Resolve employees: by email when given, else by exact full name.
  type EmployeeLite = {
    id: string;
    fullName: string;
    pickupAddressId: string | null;
    homeAddressId: string | null;
    pickupPoint: string | null;
    officeLocation: string | null;
    pickupAddress: { addressText: string; label: string | null } | null;
    homeAddress: { addressText: string; label: string | null } | null;
  };
  const userEmails = Array.from(new Set(parsed.filter((r) => r.email).map((r) => r.email)));
  const userNames = Array.from(new Set(parsed.filter((r) => !r.email && r.name).map((r) => r.name)));
  const byEmail = new Map<string, EmployeeLite>();
  for (const u of await prisma.user.findMany({
    where: { email: { in: userEmails, mode: "insensitive" } },
    include: { pickupAddress: true, homeAddress: true },
  })) {
    byEmail.set(u.email.toLowerCase(), u);
  }
  const byName = new Map<string, EmployeeLite>();
  if (userNames.length > 0) {
    for (const u of await prisma.user.findMany({
      where: { fullName: { in: userNames, mode: "insensitive" }, isActive: true },
      include: { pickupAddress: true, homeAddress: true },
    })) {
      const key = u.fullName.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, u); // duplicate names: first wins
    }
  }

  let stored = 0;
  let updated = 0;
  for (const row of parsed) {
    const user = row.email ? byEmail.get(row.email) : byName.get(row.name.trim().toLowerCase());
    if (!user) {
      skipped.push({
        line: row.line,
        reason: row.email ? `no account found for ${row.email}` : `no account found named "${row.name}"`,
      });
      continue;
    }
    const addressId = user.pickupAddressId ?? user.homeAddressId;
    if (!addressId) {
      skipped.push({ line: row.line, reason: `${user.fullName} has no pickup or home address on file` });
      continue;
    }
    const address = user.pickupAddress ?? user.homeAddress;
    const pickupLabel =
      row.pickupPoint ||
      user.pickupPoint?.trim() ||
      address?.label?.trim() ||
      address?.addressText?.trim() ||
      user.fullName;
    const data = {
      date: row.date,
      shiftKey: row.shiftKey,
      vehicleNumber: row.vehicleNumber,
      employeeId: user.id,
      addressId,
      pickupLabel: pickupLabel.slice(0, 120),
      pickupMinutes: row.pickupMinutes,
      orderIndex: row.orderIndex,
      // CSV office column wins; else the employee's office; else Regnum.
      officeLabel: normalizeOffice(row.office || user.officeLocation),
      arrivalMinutes: row.arrivalMinutes,
      sourceFile: file.name.slice(0, 120),
    };
    const existing = await prisma.manualRoutePlanEntry.findUnique({
      where: {
        date_shiftKey_vehicleNumber_employeeId: {
          date: row.date,
          shiftKey: row.shiftKey,
          vehicleNumber: row.vehicleNumber,
          employeeId: user.id,
        },
      },
    });
    if (existing) {
      await prisma.manualRoutePlanEntry.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.manualRoutePlanEntry.create({ data });
      stored += 1;
    }
  }

  // Rebuild the learned set immediately so the planner picks up the new
  // ground truth without waiting for the next RUN MAPPING.
  const learning = await trainRoutePlannerFromHistory();

  revalidatePath("/facilities/automated-route-planner");

  return {
    results: {
      stored,
      updated,
      skipped,
      learning: learning.success ? learning : undefined,
    },
  };
}