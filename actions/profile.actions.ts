"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import {
  Role,
  AddressChangeStatus,
  ContactChangeStatus,
  PickupPointChangeStatus,
} from "@/lib/constants/enums";

export type UpdateProfileState = {
  errors?: {
    pickupPoint?: string;
    address?: string;
    contactNumber?: string;
  };
  successMessages?: string[];
};

export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const session = await requireRole([Role.EMPLOYEE, Role.CORPORATE_EMPLOYEE]);

  const pickupPointRaw = formData.get("pickupPoint");
  const addressRaw = formData.get("address");
  const contactNumberRaw = formData.get("contactNumber");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  const errors: NonNullable<UpdateProfileState["errors"]> = {};
  const successMessages: string[] = [];

  // Pick-up point: requires Facilities approval.
  if (typeof pickupPointRaw === "string") {
    const newPickupPoint = pickupPointRaw.trim();
    if (
      newPickupPoint !== (user.pickupPoint ?? "").trim() &&
      newPickupPoint.length > 0
    ) {
      const existingPending = await prisma.pickupPointChangeRequest.findFirst({
        where: { employeeId: session.id, status: PickupPointChangeStatus.PENDING },
      });
      if (existingPending) {
        errors.pickupPoint =
          "You already have a pending pick-up point change request. Please wait for it to be reviewed.";
      } else {
        await prisma.pickupPointChangeRequest.create({
          data: {
            employeeId: session.id,
            oldPickupPoint: user.pickupPoint ?? "",
            newPickupPoint,
          },
        });

        successMessages.push("Pick-up point change request submitted for review.");
      }
    }
  }

  // Address: requires Operation-Admin approval.
  if (typeof addressRaw === "string") {
    const newAddress = addressRaw.trim();
    if (newAddress !== (user.address ?? "").trim() && newAddress.length > 0) {
      const existingPending = await prisma.addressChangeRequest.findFirst({
        where: { employeeId: session.id, status: AddressChangeStatus.PENDING },
      });
      if (existingPending) {
        errors.address =
          "You already have a pending address change request. Please wait for it to be reviewed.";
      } else {
        await prisma.addressChangeRequest.create({
          data: {
            employeeId: session.id,
            oldAddress: user.address ?? "",
            newAddress,
          },
        });

        successMessages.push("Address change request submitted for review.");
      }
    }
  }

  // Contact number: requires Operation-Admin approval.
  if (typeof contactNumberRaw === "string") {
    const newContactNumber = contactNumberRaw.trim();
    if (
      newContactNumber !== (user.contactNumber ?? "").trim() &&
      newContactNumber.length > 0
    ) {
      const existingPending = await prisma.contactChangeRequest.findFirst({
        where: { employeeId: session.id, status: ContactChangeStatus.PENDING },
      });
      if (existingPending) {
        errors.contactNumber =
          "You already have a pending contact number change request. Please wait for it to be reviewed.";
      } else {
        await prisma.contactChangeRequest.create({
          data: {
            employeeId: session.id,
            oldContactNumber: user.contactNumber ?? "",
            newContactNumber,
          },
        });

        successMessages.push("Contact number change request submitted for review.");
      }
    }
  }

  revalidatePath("/employee/profile");
  revalidatePath("/corporate-employee/profile");

  return {
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    successMessages,
  };
}
