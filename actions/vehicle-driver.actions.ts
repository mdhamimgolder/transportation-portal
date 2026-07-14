"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { parseCsv } from "@/lib/csv";
import { Role } from "@/lib/constants/enums";

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
  await requireRole([Role.FACILITIES]);

  const parsed = readFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  const existing = await prisma.vehicleDriver.findUnique({
    where: { vehicleNumber: parsed.data.vehicleNumber },
  });
  if (existing) {
    return { error: "A vehicle with this number already exists." };
  }

  await prisma.vehicleDriver.create({ data: parsed.data });

  revalidatePath("/facilities/vehicles");
  return {};
}

export async function updateVehicleDriver(
  _prevState: VehicleDriverFormState,
  formData: FormData
): Promise<VehicleDriverFormState> {
  await requireRole([Role.FACILITIES]);

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

  await prisma.vehicleDriver.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/facilities/vehicles");
  return {};
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
  await requireRole([Role.FACILITIES]);

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

    const existing = await prisma.vehicleDriver.findUnique({ where: { vehicleNumber } });
    if (existing) {
      skipped.push({ line, reason: `Vehicle number ${vehicleNumber} already exists.` });
      continue;
    }

    const record = await prisma.vehicleDriver.create({
      data: { driverName, contactNumber, vehicleNumber, vendor },
    });

    created.push({ driverName: record.driverName, vehicleNumber: record.vehicleNumber });
  }

  revalidatePath("/facilities/vehicles");
  return { results: { created, skipped } };
}

export async function deactivateVehicleDriver(formData: FormData): Promise<void> {
  const session = await requireRole([Role.FACILITIES]);
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await prisma.vehicleDriver.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date(), deletedBy: session.id },
  });

  revalidatePath("/facilities/vehicles");
}
