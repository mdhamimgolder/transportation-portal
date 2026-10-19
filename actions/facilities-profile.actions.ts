"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { ARRIVAL_TIME_OPTIONS, NO_TRANSPORT_VALUE, normalizeArrivalTimeInput } from "@/lib/constants/arrival-times";
import { auditEntry } from "@/lib/audit";
import { mapWithConcurrency } from "@/lib/concurrency";
import { sanitizedActionError } from "@/lib/actions/action-error";
import {
  bulkPickupPointCoordinatesSchema,
  fixedArrivalServiceInputSchema,
} from "@/lib/validation/schemas";

export type UpdateEmployeeProfileState = {
  error?: string;
  success?: boolean;
};

export type PickupPointCoordinatesState = { error?: string; success?: boolean };

export async function setAllPickupPointCoordinatesAction(
  _prevState: PickupPointCoordinatesState,
  formData: FormData
): Promise<PickupPointCoordinatesState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  const raw = requiredField(formData, "coordinatesJson");
  if (!raw || raw.length > 64_000) {
    return { error: "Enter coordinates for at least one pickup point." };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { error: "Unable to read the pickup-point coordinates." };
  }
  const parsed = bulkPickupPointCoordinatesSchema.safeParse(decoded);
  if (!parsed.success) {
    return { error: "Enter up to 500 pickup points with valid coordinate values." };
  }

  const entries: Array<{ pickupPoint: string; latitude: number; longitude: number }> = [];
  const seen = new Set<string>();
  for (const item of parsed.data) {
    const numbers = item.coordinates.split(/[\s,]+/).filter(Boolean).map(Number);
    if (numbers.length !== 2 || !numbers.every(Number.isFinite)) {
      return { error: `Enter coordinates for ${item.pickupPoint} as latitude, longitude.` };
    }
    const [latitude, longitude] = numbers;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return { error: `Coordinates for ${item.pickupPoint} are outside valid latitude/longitude ranges.` };
    }
    const key = item.pickupPoint.toLowerCase();
    if (seen.has(key)) return { error: `Duplicate pickup point: ${item.pickupPoint}.` };
    seen.add(key);
    entries.push({ pickupPoint: item.pickupPoint, latitude, longitude });
  }

  try {
    await mapWithConcurrency(entries, 4, async ({ pickupPoint, latitude, longitude }) => {
      await prisma.$transaction(async (tx) => {
        const address = await tx.address.upsert({
          where: { addressText: pickupPoint },
          update: { latitude, longitude },
          create: { addressText: pickupPoint, latitude, longitude },
        });
        await tx.user.updateMany({
          where: {
            role: { in: [Role.EMPLOYEE, Role.FIXED_ARRIVAL] },
            pickupPoint,
          },
          data: { pickupAddressId: address.id },
        });
        await auditEntry(
          session,
          {
            action: "SET_PICKUP_POINT_COORDINATES",
            entityType: "Address",
            entityId: address.id,
            after: { pickupPoint, latitude, longitude },
            description: `${session.fullName} updated coordinates for pickup point ${pickupPoint}`,
          },
          tx
        );
      });
    });
  } catch (error) {
    return sanitizedActionError("setAllPickupPointCoordinatesAction", error);
  }

  revalidatePath("/facilities/automated-route-planner");
  revalidatePath("/facilities/route-setting");
  revalidatePath("/facilities/vehicles");
  revalidatePath("/facilities/user-info");
  return { success: true };
}

export async function setPickupPointCoordinatesAction(
  _prevState: PickupPointCoordinatesState,
  formData: FormData
): Promise<PickupPointCoordinatesState> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  const pickupPoint = requiredField(formData, "pickupPoint");
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  if (!pickupPoint) return { error: "Pick-up point is required." };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { error: "Enter valid latitude and longitude values." };
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { error: "Latitude must be between -90 and 90; longitude between -180 and 180." };
  }

  const address = await prisma.address.upsert({
    where: { addressText: pickupPoint },
    update: { latitude, longitude },
    create: { addressText: pickupPoint, latitude, longitude },
  });
  await prisma.user.updateMany({
    where: { role: Role.EMPLOYEE, pickupPoint },
    data: { pickupAddressId: address.id },
  });
  revalidatePath("/facilities/automated-route-planner");
  revalidatePath("/facilities/user-info");
  return { success: true };
}

function requiredField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Facilities-side direct edit of an employee's contact/address/pick-up point --
 * bypasses the employee-initiated approval workflow (AddressChangeRequest /
 * ContactChangeRequest / PickupPointChangeRequest), since Facilities is acting
 * administratively here rather than requesting a change on their own behalf.
 */
export async function updateEmployeeProfileByFacilitiesAction(
  _prevState: UpdateEmployeeProfileState,
  formData: FormData
): Promise<UpdateEmployeeProfileState> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) {
    return { error: "Missing employee." };
  }

  const contactNumber = requiredField(formData, "contactNumber");
  const address = requiredField(formData, "address");
  const pickupPoint = requiredField(formData, "pickupPoint");
  const homeLatitude = Number(formData.get("homeLatitude"));
  const homeLongitude = Number(formData.get("homeLongitude"));
  const pickupLatitude = Number(formData.get("pickupLatitude"));
  const pickupLongitude = Number(formData.get("pickupLongitude"));

  if (!contactNumber) return { error: "Contact number is required." };
  if (!address) return { error: "Address is required." };
  if (!pickupPoint) return { error: "Pick-up point is required." };
  if (![homeLatitude, homeLongitude, pickupLatitude, pickupLongitude].every(Number.isFinite)) {
    return { error: "Enter valid latitude and longitude values for both locations." };
  }
  if (
    Math.abs(homeLatitude) > 90 || Math.abs(pickupLatitude) > 90 ||
    Math.abs(homeLongitude) > 180 || Math.abs(pickupLongitude) > 180
  ) {
    return { error: "Latitude must be between -90 and 90; longitude between -180 and 180." };
  }

  const employee = await prisma.user.findUnique({ where: { id: userId } });
  if (!employee || employee.role !== Role.EMPLOYEE) {
    return { error: "Employee not found." };
  }

  const homeAddress = await prisma.address.upsert({
    where: { addressText: address },
    update: { latitude: homeLatitude, longitude: homeLongitude },
    create: { addressText: address, latitude: homeLatitude, longitude: homeLongitude },
  });
  const pickupAddress = await prisma.address.upsert({
    where: { addressText: pickupPoint },
    update: { latitude: pickupLatitude, longitude: pickupLongitude },
    create: { addressText: pickupPoint, latitude: pickupLatitude, longitude: pickupLongitude },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      contactNumber,
      address,
      pickupPoint,
      homeAddressId: homeAddress.id,
      pickupAddressId: pickupAddress.id,
    },
  });

  revalidatePath("/facilities/user-info");
  revalidatePath("/employee/profile");
  return { success: true };
}

export type FixedArrivalServiceState = { error?: string; success?: boolean };
export type FixedArrivalServiceInput = {
  active?: boolean;
  arrivalTime?: string | null;
};

export async function updateFixedArrivalServiceAction(
  userId: string,
  input: FixedArrivalServiceInput
): Promise<FixedArrivalServiceState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
  const parsed = fixedArrivalServiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid service setting." };
  }

  try {
    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        fullName: true,
        fixedArrivalActive: true,
        fixedArrivalTime: true,
      },
    });
    if (!employee || employee.role !== Role.FIXED_ARRIVAL) {
      return { error: "Fixed-arrival employee not found." };
    }

    const data: { fixedArrivalActive?: boolean; fixedArrivalTime?: string | null } = {};
    if (parsed.data.active !== undefined) data.fixedArrivalActive = parsed.data.active;
    if (Object.hasOwn(parsed.data, "arrivalTime")) {
      const raw = parsed.data.arrivalTime;
      if (raw === null || raw === "") {
        data.fixedArrivalTime = null;
      } else if (raw) {
        const normalized = normalizeArrivalTimeInput(raw);
        if (
          !normalized ||
          (normalized !== NO_TRANSPORT_VALUE &&
            !ARRIVAL_TIME_OPTIONS.some((option) => option.value === normalized))
        ) {
          return { error: "Invalid fixed arrival time; choose a time from 10 PM through 6 AM." };
        }
        data.fixedArrivalTime = normalized === NO_TRANSPORT_VALUE ? null : normalized;
      }
    }

    const before = {
      ...(data.fixedArrivalActive !== undefined && { fixedArrivalActive: employee.fixedArrivalActive }),
      ...(data.fixedArrivalTime !== undefined && { fixedArrivalTime: employee.fixedArrivalTime }),
    };
    if (Object.keys(data).length === 0) return { success: true };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data });
      await auditEntry(
        session,
        {
          action: "UPDATE_FIXED_ARRIVAL_SERVICE",
          entityType: "User",
          entityId: userId,
          before,
          after: data,
          description: `${session.fullName} updated the fixed-arrival service for ${employee.fullName}`,
        },
        tx
      );
    });

    revalidatePath("/facilities/user-info");
    revalidatePath("/facilities/route-planning");
    revalidatePath("/employee/profile");
    revalidatePath("/fixed-arrival/my-schedule");
    revalidatePath("/fixed-arrival/dashboard");
    return { success: true };
  } catch (error) {
    return sanitizedActionError("updateFixedArrivalServiceAction", error);
  }
}
