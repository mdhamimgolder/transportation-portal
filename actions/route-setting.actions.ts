"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { sanitizedActionError } from "@/lib/actions/action-error";
import { getMondayOfWeek, parseDayKey } from "@/lib/date/week";
import { normalizeOfficeLocation } from "@/lib/constants/office-locations";
import { SHIFT_KEYS } from "@/lib/constants/route-shifts";
import type { PinState, ShiftKey } from "@/lib/constants/route-shifts";
import { syncPickupPointTimes } from "@/lib/routing/pickup-schedule";

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
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
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

    // Soft-deleted rows still hold DB-unique (vehicleId, sequence) slots —
    // push them far above the working range so renumbering never collides.
    const squatters = await prisma.pickupPoint.findMany({
      where: { vehicleId, isActive: false },
      select: { id: true },
    });
    const maxRow = await prisma.pickupPoint.aggregate({
      where: { vehicleId },
      _max: { sequence: true },
    });
    let bump = (maxRow._max.sequence ?? 0) + 1000;
    for (const row of squatters) {
      await prisma.pickupPoint.update({
        where: { id: row.id },
        data: { sequence: bump++ },
      });
    }

    // Phase 1 -- move everyone far away so renumbering can't collide
    // (temp slots start above every sequence now in the table).
    const tempBase = bump > 10000 ? bump : 10000;
    await prisma.$transaction([
      ...points.map((p, idx) =>
        prisma.pickupPoint.update({
          where: { id: p.id },
          data: { sequence: tempBase + idx },
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
      ...sanitizedActionError(
        "reorderPickupPoints",
        error,
        "Failed to reorder pickup points."
      ),
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
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    if (!SHIFT_KEYS.includes(shiftKey)) {
      return { success: false, pin: null, error: "Unknown shift." };
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return { success: false, pin: null, error: "Vehicle not found." };

    const weekStart = getMondayOfWeek(parseDayKey(weekStartDateStr));
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
      ...sanitizedActionError(
        "toggleVehicleShiftPin",
        error,
        "Failed to update pin."
      ),
    };
  }
}

/** Fetch the active vehicle↔shift pins for a week. */
export async function getVehicleShiftPins(
  weekStartDateStr: string
): Promise<{ pins: PinState[]; error?: string }> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const weekStart = getMondayOfWeek(parseDayKey(weekStartDateStr));
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
      ...sanitizedActionError(
        "getVehicleShiftPins",
        error,
        "Failed to load pins."
      ),
    };
  }
}

// ── Vehicle creation (advanced routing) ────────────────────────

export type VehicleFormState = {
  success?: boolean;
  error?: string;
  vehicleId?: string;
};

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
): Promise<{
  success: boolean;
  pickupUpdates?: Array<{ id: string; baseETA: string }>;
  error?: string;
}> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
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

    // Only first-pickup-time / BASE ETA edits re-anchor the pickup schedule, so
    // recompute then. Never hard-fail unrelated edits (e.g. capacity, driver,
    // office) just because a vehicle currently has no pickup points -- dynamic
    // 11 PM routes pick employees up from home addresses instead. Callers that
    // intentionally schedule points (`autoCalcPickupTimes`, `syncPickupPointTimes`)
    // keep surfacing schedule errors on their own.
    let pickupUpdates: Array<{ id: string; baseETA: string }> | undefined;
    if (input.baseETA !== undefined || input.firstPickupTime !== undefined) {
      const schedule = await syncPickupPointTimes(input.id);
      if (!schedule.success) {
        return { success: false, error: schedule.error };
      }
      pickupUpdates = schedule.points.map((point) => ({
        id: point.id,
        baseETA: point.pickup,
      }));
    }

    revalidatePath("/facilities/route-setting");
    revalidatePath("/facilities/vehicles");

    return {
      success: true,
      pickupUpdates,
    };
  } catch (error) {
    return {
      success: false,
      ...sanitizedActionError(
        "updateVehicle",
        error,
        "Failed to update vehicle."
      ),
    };
  }
}

// ── Pickup-time scheduling ────────────────────────────────────

/**
 * Recalculate every active pickup point's time for a vehicle using the shared
 * trained-leg rule (trained gaps only, all times on a 5-minute grid) — FORWARD
 * from the vehicle's first pickup time (set by Facilities) or BACKWARD from its
 * BASE ETA when no first pickup time is set.
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
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
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
      ...sanitizedActionError(
        "autoCalcPickupTimes",
        error,
        "Failed to calculate pickup times."
      ),
    };
  }
}