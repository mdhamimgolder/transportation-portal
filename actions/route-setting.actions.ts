"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getMondayOfWeek } from "@/lib/date/week";
import { normalizeOfficeLocation } from "@/lib/constants/office-locations";
import { SHIFT_KEYS } from "@/lib/constants/route-shifts";
import type { PinState, ShiftKey } from "@/lib/constants/route-shifts";
import { syncPickupPointTimes } from "@/lib/routing/pickup-schedule";

function parseDayString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Canonicalize an "HH:mm" time (e.g. "22:00"). Blank/absent returns null
 * (unset). Invalid values return "INVALID" so callers can error.
 */
function normalizeHHmm(raw: string | null | undefined):
  | string
  | null
  | "INVALID" {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) return "INVALID";
  const [h, m] = value.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/** BASE ETA is a default office arrival, so only the 10 PM / 11 PM shifts. */
const BASE_ETA_ALLOWED = new Set(["22:00", "23:00"]);

// ── Pickup sequence ────────────────────────────────────────────

export type ReorderResult = { success: boolean; error?: string };

/**
 * Set the pickup-point sequence for a vehicle's 10 PM route. `orderedPointIds`
 * must be exactly the vehicle's active pickup points, in the new order.
 * Sequences are renumbered 1..n (two-phase update avoids the unique index).
 */
export async function reorderPickupPoints(
  vehicleId: string,
  orderedPointIds: string[]
): Promise<ReorderResult> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    if (orderedPointIds.length === 0) return { success: false, error: "No points given." };

    const points = await prisma.pickupPoint.findMany({
      where: { vehicleId, isActive: true },
      select: { id: true },
    });
    const existingIds = points.map((p) => p.id).sort();
    const proposedIds = [...orderedPointIds].sort();
    if (JSON.stringify(existingIds) !== JSON.stringify(proposedIds)) {
      return { success: false, error: "Picker includes stale pickup points. Refresh and retry." };
    }

    // Phase 1 -- move everyone far away so renumbering can't collide.
    await prisma.$transaction([
      ...points.map((p, idx) =>
        prisma.pickupPoint.update({
          where: { id: p.id },
          data: { sequence: idx + 10000 },
        })
      ),
    ]);

    // Phase 2 -- apply the real order.
    await prisma.$transaction([
      ...orderedPointIds.map((id, idx) =>
        prisma.pickupPoint.update({
          where: { id },
          data: { sequence: idx + 1 },
        })
      ),
    ]);

    // Order changed → recompute the remaining pickup times (first point stays
    // the vehicle's first pickup time; later points are drives after it).
    await syncPickupPointTimes(vehicleId).catch(() => null);

    revalidatePath("/facilities/vehicles");
    revalidatePath("/facilities/route-setting");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reorder pickup points.",
    };
  }
}

/** Toggle a vehicle-driver pickup point's active flag (soft delete path). */
export async function setPickupPointActive(
  pointId: string,
  isActive: boolean
): Promise<ReorderResult> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
    await prisma.pickupPoint.update({ where: { id: pointId }, data: { isActive } });
    revalidatePath("/facilities/vehicles");
    revalidatePath("/facilities/route-setting");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update pickup point.",
    };
  }
}

// ── Vehicle → route pinning ────────────────────────────────────

/**
 * Toggle "pin vehicle to a shift for the week". Pinned vehicles take exclusive
 * priority when RUN MAPPING generates that shift's routes.
 */
export async function toggleVehicleShiftPin(
  vehicleId: string,
  weekStartDateStr: string,
  shiftKey: ShiftKey
): Promise<{ success: boolean; pin: PinState | null; error?: string }> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    if (!SHIFT_KEYS.includes(shiftKey)) {
      return { success: false, pin: null, error: "Unknown shift." };
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return { success: false, pin: null, error: "Vehicle not found." };

    const weekStart = getMondayOfWeek(parseDayString(weekStartDateStr));
    const existing = await prisma.vehicleShiftAssignment.findFirst({
      where: { vehicleId, startDate: weekStart },
    });

    let shifts: ShiftKey[];
    if (existing) {
      try {
        shifts = JSON.parse(existing.shifts);
        if (!Array.isArray(shifts)) shifts = [];
        shifts = shifts.map((s: string) => s as ShiftKey);
      } catch {
        shifts = [];
      }
      shifts = shifts.includes(shiftKey)
        ? shifts.filter((s) => s !== shiftKey)
        : [...shifts, shiftKey];
      shifts = [...new Set(shifts)];

      if (shifts.length === 0) {
        await prisma.vehicleShiftAssignment.delete({ where: { id: existing.id } });
      } else {
        await prisma.vehicleShiftAssignment.update({
          where: { id: existing.id },
          data: { shifts: JSON.stringify(shifts) },
        });
      }
    } else {
      await prisma.vehicleShiftAssignment.create({
        data: {
          vehicleId,
          startDate: weekStart,
          shifts: JSON.stringify([shiftKey]),
        },
      });
      shifts = [shiftKey];
    }

    revalidatePath("/facilities/route-setting");

    return { success: true, pin: shifts.length ? { vehicleId, shifts } : null };
  } catch (error) {
    return {
      success: false,
      pin: null,
      error: error instanceof Error ? error.message : "Failed to update pin.",
    };
  }
}

/** Fetch the active vehicle↔shift pins for a week. */
export async function getVehicleShiftPins(
  weekStartDateStr: string
): Promise<{ pins: PinState[]; error?: string }> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
    const weekStart = getMondayOfWeek(parseDayString(weekStartDateStr));
    const rows = await prisma.vehicleShiftAssignment.findMany({
      where: { startDate: weekStart, isActive: true },
      select: { vehicleId: true, shifts: true },
    });

    const pins: PinState[] = rows.flatMap((row) => {
      let raw: string[] = [];
      try {
        const parsed = JSON.parse(row.shifts);
        if (Array.isArray(parsed)) raw = parsed.map(String);
      } catch {
        return [];
      }
      const shifts = raw.filter((s): s is ShiftKey =>
        SHIFT_KEYS.includes(s as ShiftKey)
      );
      return shifts.length ? [{ vehicleId: row.vehicleId, shifts }] : [];
    });

    return { pins };
  } catch (error) {
    return {
      pins: [],
      error: error instanceof Error ? error.message : "Failed to load pins.",
    };
  }
}

// ── Vehicle creation (advanced routing) ────────────────────────

export type VehicleFormState = {
  success?: boolean;
  error?: string;
  vehicleId?: string;
};

export async function createVehicle(formData: FormData): Promise<VehicleFormState> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const vehicleNumber = String(formData.get("vehicleNumber") ?? "").trim();
    const vehicleType = String(formData.get("vehicleType") ?? "").trim();
    const capacity = Number(formData.get("capacity"));
    const driverName = String(formData.get("driverName") ?? "").trim();
    const driverContact = String(formData.get("driverContact") ?? "").trim();
    const officeLocation = String(formData.get("officeLocation") ?? "Regnum").trim();

    const baseETARaw = String(formData.get("baseETA") ?? "");
    const baseETA = normalizeHHmm(baseETARaw);
    if (baseETA === "INVALID") {
      return { error: "BASE ETA must be a valid time in HH:mm format (e.g. 22:00)." };
    }
    if (baseETA !== null && !BASE_ETA_ALLOWED.has(baseETA)) {
      return { error: "BASE ETA must be 10 PM (22:00) or 11 PM (23:00)." };
    }

    const firstPickupTime = normalizeHHmm(
      String(formData.get("firstPickupTime") ?? "")
    );
    if (firstPickupTime === "INVALID") {
      return {
        error: "First pickup time must be a valid time in HH:mm format (e.g. 20:00).",
      };
    }

    if (!vehicleNumber) return { error: "Vehicle number is required." };
    if (!vehicleType) return { error: "Vehicle type is required." };
    if (!Number.isInteger(capacity) || capacity <= 0) {
      return { error: "Capacity must be a positive whole number." };
    }
    if (!normalizeOfficeLocation(officeLocation)) {
      return { error: "Office location must be Regnum or Spectra." };
    }

    const existing = await prisma.vehicle.findUnique({
      where: { vehicleNumber },
    });
    if (existing) {
      return { error: `Vehicle ${vehicleNumber} already exists.` };
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleNumber,
        vehicleType,
        capacity,
        driverName: driverName || null,
        driverContact: driverContact || null,
        officeLocation: normalizeOfficeLocation(officeLocation),
        baseETA: baseETA ?? "22:00",
        firstPickupTime,
        isActive: true,
      },
    });

    revalidatePath("/facilities/route-setting");
    revalidatePath("/facilities/vehicles");

    return { success: true, vehicleId: vehicle.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create vehicle.",
    };
  }
}

/** Update an existing advanced-routing vehicle (office, type, capacity, driver). */
export async function updateVehicle(
  input: {
    id: string;
    vehicleType?: string;
    capacity?: number;
    driverName?: string;
    driverContact?: string;
    officeLocation?: string;
    baseETA?: string | null;
    firstPickupTime?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.id } });
    if (!vehicle) return { success: false, error: "Vehicle not found." };

    const data: Record<string, string | number | null> = {};
    if (input.vehicleType !== undefined) {
      const type = input.vehicleType.trim();
      if (!type) return { success: false, error: "Vehicle type is required." };
      data.vehicleType = type;
    }
    if (input.capacity !== undefined) {
      if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
        return { success: false, error: "Capacity must be a positive whole number." };
      }
      data.capacity = input.capacity;
    }
    if (input.driverName !== undefined) data.driverName = input.driverName.trim() || null;
    if (input.driverContact !== undefined)
      data.driverContact = input.driverContact.trim() || null;
    if (input.officeLocation !== undefined) {
      const office = normalizeOfficeLocation(input.officeLocation);
      if (!office) return { success: false, error: "Office location must be Regnum or Spectra." };
      data.officeLocation = office;
    }
    if (input.baseETA !== undefined) {
      const baseETA = normalizeHHmm(input.baseETA);
      if (baseETA === "INVALID") {
        return {
          success: false,
          error: "BASE ETA must be a valid time in HH:mm format (e.g. 22:00).",
        };
      }
      if (baseETA !== null && !BASE_ETA_ALLOWED.has(baseETA)) {
        return {
          success: false,
          error: "BASE ETA must be 10 PM (22:00) or 11 PM (23:00).",
        };
      }
      data.baseETA = baseETA;
    }
    if (input.firstPickupTime !== undefined) {
      const firstPickupTime = normalizeHHmm(input.firstPickupTime);
      if (firstPickupTime === "INVALID") {
        return {
          success: false,
          error: "First pickup time must be a valid time in HH:mm format (e.g. 20:00).",
        };
      }
      data.firstPickupTime = firstPickupTime;
    }

    await prisma.vehicle.update({ where: { id: input.id }, data });

    // First pickup time / BASE ETA edits re-anchor the whole pickup schedule.
    await syncPickupPointTimes(input.id).catch(() => null);

    revalidatePath("/facilities/route-setting");
    revalidatePath("/facilities/vehicles");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update vehicle.",
    };
  }
}

// ── Pickup-time scheduling ────────────────────────────────────

/**
 * Recalculate every active pickup point's time for a vehicle using the shared
 * 5 min/km rule (all times on a 5-minute grid) — FORWARD from the vehicle's
 * first pickup time (set by Facilities) or BACKWARD from its BASE ETA when no
 * first pickup time is set.
 * Persists each point's baseETA and returns the per-point updates so the UI can
 * stay in sync without a refetch.
 */
export async function autoCalcPickupTimes(
  vehicleId: string
): Promise<{
  success: boolean;
  updates?: Array<{ id: string; baseETA: string }>;
  method?: "first_pickup" | "base_eta";
  computedOfficeArrival?: string | null;
  error?: string;
}> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const result = await syncPickupPointTimes(vehicleId);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath("/facilities/route-setting");
    revalidatePath("/facilities/vehicles");

    return {
      success: true,
      updates: result.points.map((p) => ({ id: p.id, baseETA: p.pickup })),
      method: result.method,
      computedOfficeArrival: result.officeArrival,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to calculate pickup times.",
    };
  }
}