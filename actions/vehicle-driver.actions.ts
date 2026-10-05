"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { parseCsv } from "@/lib/csv";
import { Role } from "@/lib/constants/enums";
import { sanitizedActionError, throwSanitizedError } from "@/lib/actions/action-error";
import { audit, auditEntry } from "@/lib/audit";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { invalidateCacheTag } from "@/lib/cache-invalidate";
import { mapWithConcurrency } from "@/lib/concurrency";

const MAX_UPLOAD_BYTES = 1024 * 1024;
const MAX_UPLOAD_ROWS = 1000;

/**
 * Route planning runs on `Vehicle` rows; the Vehicles & Drivers master list is
 * `VehicleDriver`. Keep the two in step on every master-list write (this used
 * to run as an upsert per driver on EVERY Route Setting page view).
 */
function syncVehicleFromDriver(record: {
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
}) {
  const vehicleNumber = record.vehicleNumber.trim();
  return prisma.vehicle.upsert({
    where: { vehicleNumber },
    update: {
      driverName: record.driverName,
      driverContact: record.contactNumber,
      isActive: true,
    },
    create: {
      vehicleNumber,
      vehicleType: "STANDARD",
      capacity: 4,
      driverName: record.driverName,
      driverContact: record.contactNumber,
      officeLocation: "Regnum",
    },
    select: { id: true },
  });
}

function afterFleetChange(): void {
  invalidateCacheTag(CACHE_TAGS.vehicles);
  revalidatePath("/facilities/vehicles");
  revalidatePath("/facilities/route-setting");
}

export type VehicleDriverFormState = {
  error?: string;
};

function readFields(formData: FormData) {
  const driverName = formData.get("driverName");
  const contactNumber = formData.get("contactNumber");
  const vehicleNumber = formData.get("vehicleNumber");
  const vendor = formData.get("vendor");

  if (typeof driverName !== "string" || driverName.trim().length === 0) {
    return { error: "Driver name is required." } as const;
  }
  if (typeof contactNumber !== "string" || contactNumber.trim().length === 0) {
    return { error: "Contact number is required." } as const;
  }
  if (typeof vehicleNumber !== "string" || vehicleNumber.trim().length === 0) {
    return { error: "Vehicle number is required." } as const;
  }
  if (typeof vendor !== "string" || vendor.trim().length === 0) {
    return { error: "Vendor is required." } as const;
  }

  return {
    data: {
      driverName: driverName.trim(),
      contactNumber: contactNumber.trim(),
      vehicleNumber: vehicleNumber.trim(),
      vendor: vendor.trim(),
    },
  } as const;
}

export async function createVehicleDriver(
  _prevState: VehicleDriverFormState,
  formData: FormData
): Promise<VehicleDriverFormState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
  const parsed = readFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  const existing = await prisma.vehicleDriver.findUnique({
    where: { vehicleNumber: parsed.data.vehicleNumber },
  });
  if (existing) {
    return { error: "A vehicle with this number already exists." };
  }

  const [created] = await prisma.$transaction([
    prisma.vehicleDriver.create({ data: parsed.data, select: { id: true } }),
    syncVehicleFromDriver(parsed.data),
  ]);
  await audit(session, {
    action: "CREATE_VEHICLE_DRIVER",
    entityType: "VehicleDriver",
    entityId: created.id,
    after: parsed.data,
    description: `${session.fullName} added vehicle ${parsed.data.vehicleNumber} (${parsed.data.driverName})`,
  });

  afterFleetChange();
  return {};
  } catch (error) {
    return sanitizedActionError("createVehicleDriver", error);
  }
}

export async function updateVehicleDriver(
  _prevState: VehicleDriverFormState,
  formData: FormData
): Promise<VehicleDriverFormState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { error: "Missing record." };
  }

  const parsed = readFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  const existing = await prisma.vehicleDriver.findUnique({ where: { id } });
  if (!existing) return { error: "Record not found." };

  const duplicate = await prisma.vehicleDriver.findFirst({
    where: { vehicleNumber: parsed.data.vehicleNumber, NOT: { id } },
  });
  if (duplicate) {
    return { error: "A vehicle with this number already exists." };
  }

  await prisma.$transaction([
    prisma.vehicleDriver.update({
      where: { id },
      data: parsed.data,
      select: { id: true },
    }),
    syncVehicleFromDriver(parsed.data),
    auditEntry(session, {
      action: "UPDATE_VEHICLE_DRIVER",
      entityType: "VehicleDriver",
      entityId: id,
      before: {
        driverName: existing.driverName,
        contactNumber: existing.contactNumber,
        vehicleNumber: existing.vehicleNumber,
        vendor: existing.vendor,
      },
      after: parsed.data,
      description: `${session.fullName} updated vehicle ${parsed.data.vehicleNumber}`,
    }),
  ]);

  afterFleetChange();
  return {};
  } catch (error) {
    return sanitizedActionError("updateVehicleDriver", error);
  }
}

export type BulkCreateResultRow = { driverName: string; vehicleNumber: string };
export type BulkCreateSkipRow = { line: number; reason: string };
export type BulkCreateVehicleDriversState = {
  error?: string;
  results?: { created: BulkCreateResultRow[]; skipped: BulkCreateSkipRow[] };
};

export async function bulkCreateVehicleDriversAction(
  _prevState: BulkCreateVehicleDriversState,
  formData: FormData
): Promise<BulkCreateVehicleDriversState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "The CSV file is too large (max 1 MB)." };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "The CSV file has no data rows." };
  }
  if (rows.length - 1 > MAX_UPLOAD_ROWS) {
    return { error: `The CSV file has too many rows (max ${MAX_UPLOAD_ROWS}).` };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name);
  const idx = {
    driverName: colIndex("drivername"),
    contactNumber: colIndex("contactnumber"),
    vehicleNumber: colIndex("vehiclenumber"),
    vendor: colIndex("vendor"),
  };
  if (
    idx.driverName === -1 ||
    idx.contactNumber === -1 ||
    idx.vehicleNumber === -1 ||
    idx.vendor === -1
  ) {
    return {
      error: "CSV must include driverName, contactNumber, vehicleNumber, and vendor columns.",
    };
  }

  const created: BulkCreateResultRow[] = [];
  const skipped: BulkCreateSkipRow[] = [];
  const toCreate: {
    driverName: string;
    contactNumber: string;
    vehicleNumber: string;
    vendor: string;
  }[] = [];

  // One batched existence check for the whole file instead of a findUnique
  // per row. Numbers created by this upload join the set so duplicates within
  // the file are reported per-row instead of throwing a P2002 mid-loop.
  const fileNumbers = rows
    .slice(1)
    .map((cols) => cols[idx.vehicleNumber]?.trim())
    .filter((n): n is string => !!n);
  const takenNumbers = new Set(
    (
      await prisma.vehicleDriver.findMany({
        where: { vehicleNumber: { in: fileNumbers } },
        select: { vehicleNumber: true },
      })
    ).map((r) => r.vehicleNumber)
  );

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cols = rows[i];
    const driverName = cols[idx.driverName]?.trim();
    const contactNumber = cols[idx.contactNumber]?.trim();
    const vehicleNumber = cols[idx.vehicleNumber]?.trim();
    const vendor = cols[idx.vendor]?.trim();

    if (!driverName || !contactNumber || !vehicleNumber || !vendor) {
      skipped.push({
        line,
        reason: "Missing one or more required fields (driverName, contactNumber, vehicleNumber, vendor).",
      });
      continue;
    }

    if (takenNumbers.has(vehicleNumber)) {
      skipped.push({ line, reason: `Vehicle number ${vehicleNumber} already exists.` });
      continue;
    }

    takenNumbers.add(vehicleNumber);
    toCreate.push({ driverName, contactNumber, vehicleNumber, vendor });
    created.push({ driverName, vehicleNumber });
  }

  // Validated rows go in as one batched insert; the planner's Vehicle rows
  // are synced with bounded concurrency.
  if (toCreate.length > 0) {
    await prisma.vehicleDriver.createMany({ data: toCreate });
    await mapWithConcurrency(toCreate, 5, (record) => syncVehicleFromDriver(record));
    await audit(session, {
      action: "BULK_CREATE_VEHICLE_DRIVERS",
      entityType: "VehicleDriver",
      after: { vehicleNumbers: toCreate.map((r) => r.vehicleNumber), skipped: skipped.length },
      description: `${session.fullName} bulk-added ${toCreate.length} vehicles (${skipped.length} skipped)`,
    });
  }

  afterFleetChange();
  return { results: { created, skipped } };
  } catch (error) {
    return sanitizedActionError("bulkCreateVehicleDriversAction", error);
  }
}

export async function deactivateVehicleDriver(formData: FormData): Promise<void> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  try {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await prisma.$transaction([
    prisma.vehicleDriver.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date(), deletedBy: session.id },
      select: { id: true },
    }),
    auditEntry(session, {
      action: "DEACTIVATE_VEHICLE_DRIVER",
      entityType: "VehicleDriver",
      entityId: id,
      description: `${session.fullName} deactivated a vehicle/driver record`,
    }),
  ]);

  afterFleetChange();
  } catch (error) {
    throwSanitizedError("deactivateVehicleDriver", error);
  }
}
