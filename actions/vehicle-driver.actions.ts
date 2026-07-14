"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
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
