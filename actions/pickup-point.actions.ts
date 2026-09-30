"use server";

import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { syncPickupPointTimes } from "@/lib/routing/pickup-schedule";

/**
 * The (vehicleId, sequence) pair is UNIQUE at the database level — soft-deleted
 * (isActive=false) rows keep occupying their sequence slot and block new
 * points at that position. Move any INACTIVE row holding `sequence` to a free
 * high slot (above every sequence of the vehicle) so the position opens up.
 * Active rows are never touched.
 */
async function clearInactiveRowsFromSequence(
  vehicleId: string,
  sequence: number
): Promise<void> {
  const squatters = await prisma.pickupPoint.findMany({
    where: { vehicleId, sequence, isActive: false },
    select: { id: true },
  });
  if (squatters.length === 0) return;
  const maxRow = await prisma.pickupPoint.aggregate({
    where: { vehicleId },
    _max: { sequence: true },
  });
  let next = (maxRow._max.sequence ?? 0) + 1000;
  for (const row of squatters) {
    await prisma.pickupPoint.update({
      where: { id: row.id },
      data: { sequence: next++ },
    });
  }
}

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
    // The point name must be the LOCATION, never a resident's name. Real
    // address rows keep the location in `addressText` (their `label` is the
    // first employee who lived there — e.g. "Shamim Hasan" on the SS
    // Properties row), so for those the name is forced to `addressText`.
    // Only coordinate-only rows ("23.75, 90.37") carry their name in `label`.
    const address = await prisma.address.findUnique({
      where: { id: input.addressId },
      select: { addressText: true },
    });
    const isCoordinateText = (text: string): boolean =>
      /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(text);
    const name =
      address && !isCoordinateText(address.addressText)
        ? address.addressText
        : input.name.trim();
    if (!name) {
      return { success: false, error: "Pickup point has no name" };
    }

    // Only an ACTIVE point is a real conflict — soft-deleted rows squatting on
    // the slot are pushed out of the way first (they still hold the DB-unique
    // (vehicleId, sequence) index).
    const existing = await prisma.pickupPoint.findFirst({
      where: {
        vehicleId: input.vehicleId,
        sequence: input.sequence,
        isActive: true,
      },
    });

    if (existing) {
      return {
        success: false,
        error: `Sequence ${input.sequence} already exists for this vehicle`,
      };
    }
    await clearInactiveRowsFromSequence(input.vehicleId, input.sequence);

    const point = await prisma.pickupPoint.create({
      data: {
        name,
        sequence: input.sequence,
        vehicleId: input.vehicleId,
        addressId: input.addressId,
        baseETA: input.baseETA ?? "20:00",
        isActive: true,
      },
      include: { address: true },
    });

    // Sequence changed → recompute the remaining pickup times (first point
    // anchored on the vehicle's first pickup time / BASE ETA, trained legs only).
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
    const current = await prisma.pickupPoint.findUnique({
      where: { id: input.id },
      select: { vehicleId: true, sequence: true },
    });
    if (!current) {
      return { success: false, error: "Pickup point not found" };
    }

    // Moving to an occupied position: an ACTIVE row is a real conflict; a
    // soft-deleted row squatting on the slot is pushed out of the way first
    // (it still holds the DB-unique (vehicleId, sequence) index).
    if (input.sequence !== undefined && input.sequence !== current.sequence) {
      const clash = await prisma.pickupPoint.findFirst({
        where: {
          vehicleId: current.vehicleId,
          sequence: input.sequence,
          isActive: true,
          id: { not: input.id },
        },
        select: { id: true },
      });
      if (clash) {
        return {
          success: false,
          error: `Sequence ${input.sequence} already exists for this vehicle`,
        };
      }
      await clearInactiveRowsFromSequence(current.vehicleId, input.sequence);
    }

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
