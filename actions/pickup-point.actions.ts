"use server";

import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { syncPickupPointTimes } from "@/lib/routing/pickup-schedule";

/**
 * Create a new pickup point for a vehicle
 */
export async function createPickupPoint(input: {
  vehicleId: string;
  addressId: string;
  name: string;
  sequence: number;
  baseETA?: string; // accepted for backward-compat; syncPickupPointTimes recomputes it
}) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    // Check if sequence already exists for this vehicle
    const existing = await prisma.pickupPoint.findFirst({
      where: {
        vehicleId: input.vehicleId,
        sequence: input.sequence,
      },
    });

    if (existing) {
      return {
        success: false,
        error: `Sequence ${input.sequence} already exists for this vehicle`,
      };
    }

    const point = await prisma.pickupPoint.create({
      data: {
        name: input.name,
        sequence: input.sequence,
        vehicleId: input.vehicleId,
        addressId: input.addressId,
        baseETA: input.baseETA ?? "20:00",
        isActive: true,
      },
      include: { address: true },
    });

    // Sequence changed → recompute the remaining pickup times (first point
    // anchored on the vehicle's first pickup time / BASE ETA, 5 min/km).
    await syncPickupPointTimes(input.vehicleId).catch(() => null);

    revalidatePath("/facilities/vehicles");

    return { success: true, data: point };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create pickup point",
    };
  }
}

/**
 * Update an existing pickup point
 */
export async function updatePickupPoint(input: {
  id: string;
  name?: string;
  sequence?: number;
  baseETA?: string;
  isActive?: boolean;
}) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const point = await prisma.pickupPoint.update({
      where: { id: input.id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.sequence && { sequence: input.sequence }),
        ...(input.baseETA && { baseETA: input.baseETA }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      include: { address: true },
    });

    const owner = await prisma.pickupPoint.findUnique({
      where: { id: input.id },
      select: { vehicleId: true },
    });
    if (owner) await syncPickupPointTimes(owner.vehicleId).catch(() => null);

    revalidatePath("/facilities/vehicles");

    return { success: true, data: point };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update pickup point",
    };
  }
}

/**
 * Delete a pickup point (soft delete)
 */
export async function deletePickupPoint(id: string) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const owner = await prisma.pickupPoint.findUnique({
      where: { id },
      select: { vehicleId: true },
    });

    await prisma.pickupPoint.update({
      where: { id },
      data: { isActive: false },
    });

    if (owner) await syncPickupPointTimes(owner.vehicleId).catch(() => null);

    revalidatePath("/facilities/vehicles");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete pickup point",
    };
  }
}

/**
 * Get all addresses for dropdown
 */
export async function getAddressesForPickupPoints() {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const addresses = await prisma.address.findMany({
      select: {
        id: true,
        addressText: true,
        label: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { addressText: "asc" },
    });

    return { success: true, data: addresses };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch addresses",
    };
  }
}
