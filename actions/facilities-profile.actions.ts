"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";

export type UpdateEmployeeProfileState = {
  error?: string;
  success?: boolean;
};

export type PickupPointCoordinatesState = { error?: string; success?: boolean };

export async function setPickupPointCoordinatesAction(
  _prevState: PickupPointCoordinatesState,
  formData: FormData
): Promise<PickupPointCoordinatesState> {
  await requireRole([Role.FACILITIES]);
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
  await requireRole([Role.FACILITIES]);

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
