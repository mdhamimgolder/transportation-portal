"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { dbErrorMessage } from "@/lib/db/retry";
import { requireRole } from "@/lib/rbac/guards";
import { Role, OFFICE_LOCATIONS } from "@/lib/constants/enums";
import type { OfficeLocation } from "@/lib/constants/enums";
import {
  ARRIVAL_TIME_OPTIONS,
  NO_TRANSPORT_VALUE,
  normalizeArrivalTimeInput,
} from "@/lib/constants/arrival-times";

export type UpdateEmployeeProfileState = {
  error?: string;
  success?: boolean;
};

export type PickupPointCoordinatesState = { error?: string; success?: boolean };

type PickupPointCoordinatesInput = { pickupPoint: string; coordinates: string };

export async function setAllPickupPointCoordinatesAction(
  _prevState: PickupPointCoordinatesState,
  formData: FormData
): Promise<PickupPointCoordinatesState> {
  await requireRole([Role.FACILITIES]);
  const rawCoordinates = requiredField(formData, "coordinatesJson");
  if (!rawCoordinates) return { error: "Enter coordinates for at least one pickup point." };

  let entries: PickupPointCoordinatesInput[];
  try {
    const parsed: unknown = JSON.parse(rawCoordinates);
    if (!Array.isArray(parsed)) throw new Error();
    entries = parsed as PickupPointCoordinatesInput[];
  } catch {
    return { error: "Unable to read the pickup-point coordinates." };
  }

  const values = entries.map((entry) => {
    const coordinates = entry.coordinates.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    return { pickupPoint: entry.pickupPoint.trim(), coordinates };
  });
  if (values.length === 0) return { error: "Enter coordinates for at least one pickup point." };
  if (values.some(({ pickupPoint, coordinates }) => !pickupPoint || coordinates.length !== 2 || !coordinates.every(Number.isFinite))) {
    return { error: "Enter every coordinate in this format: latitude, longitude." };
  }
  if (values.some(({ coordinates: [latitude, longitude] }) => Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
    return { error: "Latitude must be between -90 and 90; longitude between -180 and 180." };
  }

  const addresses = await Promise.all(values.map(async ({ pickupPoint, coordinates: [latitude, longitude] }) => {
    const address = await prisma.address.upsert({
      where: { addressText: pickupPoint },
      update: { latitude, longitude },
      create: { addressText: pickupPoint, latitude, longitude },
    });
    await linkPickupPointsToAddress(pickupPoint, address.id);
    return { pickupPoint, addressId: address.id };
  }));

  // Both plain employees AND fixed-arrival employees inherit the saved point
  // coordinates — FIXED_ARRIVAL rows were previously excluded here, so their
  // pick-up lat/lng never synced with this page (User Info showed "Not set"
  // and generation couldn't resolve their point).
  await Promise.all(addresses.map(({ pickupPoint, addressId }) => prisma.user.updateMany({
    where: { role: { in: [Role.EMPLOYEE, Role.FIXED_ARRIVAL] }, pickupPoint },
    data: { pickupAddressId: addressId },
  })));

  revalidatePath("/facilities/pickup-point-coordinates");
  revalidatePath("/facilities/route-setting");
  revalidatePath("/facilities/vehicles");
  revalidatePath("/facilities/user-info");
  return { success: true };
}

export async function setPickupPointCoordinatesAction(
  _prevState: PickupPointCoordinatesState,
  formData: FormData
): Promise<PickupPointCoordinatesState> {
  await requireRole([Role.FACILITIES]);
  const pickupPoint = requiredField(formData, "pickupPoint");
  const coordinates = requiredField(formData, "coordinates");
  if (!pickupPoint) return { error: "Pick-up point is required." };
  if (!coordinates) return { error: "Enter latitude and longitude, separated by a comma." };

  const values = coordinates.split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length !== 2 || !values.every(Number.isFinite)) {
    return { error: "Enter coordinates in this format: latitude, longitude." };
  }
  const [latitude, longitude] = values;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { error: "Latitude must be between -90 and 90; longitude between -180 and 180." };
  }

  const address = await prisma.address.upsert({
    where: { addressText: pickupPoint },
    update: { latitude, longitude },
    create: { addressText: pickupPoint, latitude, longitude },
  });
  await linkPickupPointsToAddress(pickupPoint, address.id);
  // FIXED_ARRIVAL included — see the same comment in setAllPickupPointCoordinatesAction.
  await prisma.user.updateMany({
    where: { role: { in: [Role.EMPLOYEE, Role.FIXED_ARRIVAL] }, pickupPoint },
    data: { pickupAddressId: address.id },
  });
  revalidatePath("/facilities/pickup-point-coordinates");
  revalidatePath("/facilities/route-setting");
  revalidatePath("/facilities/vehicles");
  revalidatePath("/facilities/user-info");
  return { success: true };
}

function requiredField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * After saving coordinates for a pick-up point name, relink any vehicle
 * PickupPoint rows that carry the same name but point at a DIFFERENT Address
 * row (e.g. an auto-geocoded "23.819..., 90.365..." text row created by the
 * route planner, or an address without coordinates) to the canonical named
 * Address row that now holds the saved lat/lng. Without this, coordinates
 * set on the Pick-up Points page never reach Route Setting / route
 * generation, because the two pages end up on separate Address rows.
 */
async function linkPickupPointsToAddress(
  pickupPoint: string,
  addressId: string
): Promise<number> {
  const points = await prisma.pickupPoint.findMany({
    where: {
      isActive: true,
      name: { equals: pickupPoint, mode: "insensitive" },
    },
    select: { id: true, addressId: true },
  });
  const stale = points.filter((p) => p.addressId !== addressId);
  await Promise.all(
    stale.map((p) =>
      prisma.pickupPoint.update({
        where: { id: p.id },
        data: { addressId },
      })
    )
  );
  return stale.length;
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
  await requireRole([Role.FACILITIES]);

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) {
    return { error: "Missing employee." };
  }

  const fullName = requiredField(formData, "fullName");
  const contactNumber = requiredField(formData, "contactNumber");
  const address = requiredField(formData, "address");
  const pickupPoint = requiredField(formData, "pickupPoint");
  const officeLocation = requiredField(formData, "officeLocation");
  const homeLatitude = Number(formData.get("homeLatitude"));
  const homeLongitude = Number(formData.get("homeLongitude"));
  const pickupLatitude = Number(formData.get("pickupLatitude"));
  const pickupLongitude = Number(formData.get("pickupLongitude"));

  const employeeCodeRaw = formData.get("employeeCode");
  const employeeCode =
    typeof employeeCodeRaw === "string" && employeeCodeRaw.trim()
      ? employeeCodeRaw.trim()
      : null;

  if (!fullName) return { error: "Full name is required." };
  if (!contactNumber) return { error: "Contact number is required." };
  if (!address) return { error: "Address is required." };
  if (!pickupPoint) return { error: "Pick-up point is required." };
  if (!officeLocation) return { error: "Office location is required." };
  if (!OFFICE_LOCATIONS.includes(officeLocation as OfficeLocation)) {
    return { error: "Invalid office location." };
  }
  if (![homeLatitude, homeLongitude, pickupLatitude, pickupLongitude].every(Number.isFinite)) {
    return { error: "Enter valid latitude and longitude values for both locations." };
  }
  if (
    Math.abs(homeLatitude) > 90 || Math.abs(pickupLatitude) > 90 ||
    Math.abs(homeLongitude) > 180 || Math.abs(pickupLongitude) > 180
  ) {
    return { error: "Latitude must be between -90 and 90; longitude between -180 and 180." };
  }

  try {
    const employee = await prisma.user.findUnique({ where: { id: userId } });
    if (
      !employee ||
      (employee.role !== Role.EMPLOYEE && employee.role !== Role.FIXED_ARRIVAL)
    ) {
      return { error: "Employee not found." };
    }

    // Fixed-arrival employees lock their arrival time once; only Facilities can
    // change it afterwards. The select always carries a value: a valid arrival
    // time, or the "Not required / not set" sentinel which clears the field.
    const fixedArrivalRaw = formData.get("fixedArrivalTime");
    const fixedArrivalNormalized = normalizeArrivalTimeInput(
      typeof fixedArrivalRaw === "string" ? fixedArrivalRaw : ""
    );
    if (employee.role === Role.FIXED_ARRIVAL) {
      if (!fixedArrivalNormalized) {
        return { error: "Please pick a valid fixed arrival time (10 PM through 6 AM)." };
      }
      if (
        fixedArrivalNormalized !== NO_TRANSPORT_VALUE &&
        !ARRIVAL_TIME_OPTIONS.some((o) => o.value === fixedArrivalNormalized)
      ) {
        return { error: "Invalid fixed arrival time." };
      }
    }

    // Coordinates guard: when the fixed-arrival employee is linked to a pickup
    // point, that point's Address row MUST carry the point's real coordinates —
    // the route generators plan every fixed-arrival rider from this row, so a
    // (0,0) or blank row would silently place the pickup in the Gulf of Guinea.
    if (employee.role === Role.FIXED_ARRIVAL && employee.pickupAddressId) {
      const linked = await prisma.address.findUnique({
        where: { id: employee.pickupAddressId },
        select: { addressText: true, latitude: true, longitude: true },
      });
      if (
        !linked ||
        (linked.latitude === 0 && linked.longitude === 0) ||
        linked.latitude === null ||
        linked.longitude === null
      ) {
        return {
          error:
            "The linked pick-up point has no coordinates. Set its latitude/longitude on the Pick-up Points page before saving this profile.",
        };
      }
    }

    // Employee ID is unique in the database — catch collisions with a friendly
    // message instead of a raw Prisma unique-constraint error. Any format is
    // accepted; an empty value clears the field (column is nullable).
    if (employeeCode) {
      const codeOwner = await prisma.user.findUnique({
        where: { employeeCode },
        select: { id: true },
      });
      if (codeOwner && codeOwner.id !== userId) {
        return { error: `Employee ID ${employeeCode} is already used by another employee.` };
      }
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
        fullName,
        employeeCode,
        contactNumber,
        address,
        pickupPoint,
        officeLocation,
        homeAddressId: homeAddress.id,
        pickupAddressId: pickupAddress.id,
        ...(employee.role === Role.FIXED_ARRIVAL
          ? {
              fixedArrivalTime:
                fixedArrivalNormalized === NO_TRANSPORT_VALUE ? null : fixedArrivalNormalized,
            }
          : {}),
      },
    });
  } catch (error) {
    return {
      error: `Could not save the profile: ${dbErrorMessage(error)} — please try again.`,
    };
  }

  revalidatePath("/facilities/user-info");
  revalidatePath("/employee/profile");
  revalidatePath("/fixed-arrival/my-schedule");
  revalidatePath("/fixed-arrival/dashboard");
  return { success: true };
}

export type FixedArrivalServiceState = { error?: string; success?: boolean };

export type FixedArrivalServiceInput = {
  active?: boolean;
  arrivalTime?: string | null;
};

/**
 * Facilities' per-row fixed-arrival controls for the User Info page: toggle the
 * service switch (ON/OFF, independent of the saved time) and/or change the
 * standing arrival time. Turning OFF keeps the time on the record so it can be
 * restored instantly; mapping excludes OFF users (see ensureFixedArrivalSchedules).
 */
export async function updateFixedArrivalServiceAction(
  userId: string,
  input: FixedArrivalServiceInput
): Promise<FixedArrivalServiceState> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const employee = await prisma.user.findUnique({ where: { id: userId } });
  if (!employee || employee.role !== Role.FIXED_ARRIVAL) {
    return { error: "Fixed-arrival employee not found." };
  }

  const data: { fixedArrivalActive?: boolean; fixedArrivalTime?: string | null } = {};
  if (typeof input.active === "boolean") {
    data.fixedArrivalActive = input.active;
  }

  if (Object.hasOwn(input, "arrivalTime")) {
    const raw = input.arrivalTime;
    if (typeof raw === "string" && raw.length > 0) {
      const normalized = normalizeArrivalTimeInput(raw);
      if (
        !normalized ||
        (normalized !== NO_TRANSPORT_VALUE &&
          !ARRIVAL_TIME_OPTIONS.some((o) => o.value === normalized))
      ) {
        return { error: "Invalid fixed arrival time — must be between 10 PM and 6 AM." };
      }
      data.fixedArrivalTime = normalized === NO_TRANSPORT_VALUE ? null : normalized;
    } else if (raw === null) {
      data.fixedArrivalTime = null;
    }
  }

  if (Object.keys(data).length === 0) return { success: true };

  await prisma.user.update({ where: { id: userId }, data });

  revalidatePath("/facilities/user-info");
  revalidatePath("/employee/profile");
  revalidatePath("/fixed-arrival/my-schedule");
  revalidatePath("/fixed-arrival/dashboard");
  return { success: true };
}
