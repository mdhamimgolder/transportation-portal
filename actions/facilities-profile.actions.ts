"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";

export type UpdateEmployeeProfileState = {
  error?: string;
  success?: boolean;
};

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

  if (!contactNumber) return { error: "Contact number is required." };
  if (!address) return { error: "Address is required." };
  if (!pickupPoint) return { error: "Pick-up point is required." };

  const employee = await prisma.user.findUnique({ where: { id: userId } });
  if (!employee || employee.role !== Role.EMPLOYEE) {
    return { error: "Employee not found." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { contactNumber, address, pickupPoint },
  });

  revalidatePath("/facilities/user-info");
  revalidatePath("/employee/profile");
  return { success: true };
}
