"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { parseCsv } from "@/lib/csv";
import {
  parseClockTime,
  shiftKeyForShiftLabel,
  shiftKeyFromClockTime,
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
    /** Data rows the uploaded file actually contained (before any validation). */
    read: number;
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

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function makeUtcMidnight(year: number, monthIndex: number, day: number): Date | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`;
  const date = new Date(iso);
  // Rejects day-of-month overflow (e.g. 31/02 → rolls into March).
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== day ? null : date;
}

/**
 * Accepts the date formats Excel actually produces when saving CSV:
 * 2026-09-07, 2026/09/07, 07-09-2026, 07/09/2026, 07.09.2026 (day-first,
 * the Bangladesh/Excel convention), and "07 Sep 2026" / "07-Sep-2026".
 */
function toDateUtcMidnight(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  let m = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return makeUtcMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return makeUtcMidnight(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = value.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (m) {
    const monthIndex = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    if (monthIndex !== undefined) {
      return makeUtcMidnight(Number(m[3]), monthIndex, Number(m[1]));
    }
  }
  return null;
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
    // The shift column accepts a shift label ("10 PM", "12 AM") OR the office
    // arrival time itself ("10:30 PM") — manual plans write both as the same
    // thing. When a clock time is given, it also fills in the office arrival
    // if the officeArrival column is blank.
    const shiftRaw = cell("shift");
    const shiftMinutes = parseClockTime(shiftRaw);
    let shiftKey = shiftKeyForShiftLabel(shiftRaw);
    const arrivalFromShift = shiftKey === null && shiftMinutes !== null;
    if (arrivalFromShift) {
      shiftKey = shiftKeyFromClockTime(shiftMinutes);
    }
    if (!shiftKey) {
      skipped.push({
        line,
        reason: `unknown shift "${shiftRaw}" (use 10 PM, 11 PM, 12 AM…6 AM — or the arrival time like 10:30 PM)`,
      });
      continue;
    }
    // Blank vehicleNumber: the row still teaches its last-pickup→office gap
    // as a single-stop run (pickup→pickup gaps need a known vehicle run).
    const vehicleNumber = cell("vehicleNumber") || `__row_${line}`;
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
    // officeArrival column wins; when it is blank/invalid and the shift column
    // held an arrival time ("10:30 PM"), that time is the arrival.
    const arrivalMinutes =
      parseClockTime(arrivalRaw) ?? (arrivalFromShift ? shiftMinutes : null);
    if (arrivalMinutes === null) {
      skipped.push({
        line,
        reason: `invalid or missing officeArrival "${arrivalRaw}" — or write the arrival time in the shift column (e.g. 10:30 PM)`,
      });
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
      read: rows.length - 1,
      stored,
      updated,
      skipped,
      learning: learning.success ? learning : undefined,
    },
  };
}