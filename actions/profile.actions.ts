"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import {
  Role,
  AuditActionType,
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
  const session = await requireRole([Role.EMPLOYEE]);

  const pickupPointRaw = formData.get("pickupPoint");
  const addressRaw = formData.get("address");
  const contactNumberRaw = formData.get("contactNumber");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  const errors: NonNullable<UpdateProfileState["errors"]> = {};
  const successMessages: string[] = [];

  // Pick-up point: requires Operations approval.
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
        const request = await prisma.pickupPointChangeRequest.create({
          data: {
            employeeId: session.id,
            oldPickupPoint: user.pickupPoint ?? "",
            newPickupPoint,
          },
        });

        await writeAuditLog({
          actor: { id: session.id, email: session.email, role: session.role },
          actionType: AuditActionType.PICKUP_POINT_CHANGE_REQUESTED,
          entityType: "PickupPointChangeRequest",
          entityId: request.id,
          before: { pickupPoint: user.pickupPoint },
          after: { pickupPoint: newPickupPoint },
          description: `${session.fullName} requested a pick-up point change`,
        });

        successMessages.push("Pick-up point change request submitted for review.");
      }
    }
  }

  // Address: requires Operations approval.
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
        const request = await prisma.addressChangeRequest.create({
          data: {
            employeeId: session.id,
            oldAddress: user.address ?? "",
            newAddress,
          },
        });

        await writeAuditLog({
          actor: { id: session.id, email: session.email, role: session.role },
          actionType: AuditActionType.ADDRESS_CHANGE_REQUESTED,
          entityType: "AddressChangeRequest",
          entityId: request.id,
          before: { address: user.address },
          after: { address: newAddress },
          description: `${session.fullName} requested an address change`,
        });

        successMessages.push("Address change request submitted for review.");
      }
    }
  }

  // Contact number: requires Operations approval.
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
        const request = await prisma.contactChangeRequest.create({
          data: {
            employeeId: session.id,
            oldContactNumber: user.contactNumber ?? "",
            newContactNumber,
          },
        });

        await writeAuditLog({
          actor: { id: session.id, email: session.email, role: session.role },
          actionType: AuditActionType.CONTACT_CHANGE_REQUESTED,
          entityType: "ContactChangeRequest",
          entityId: request.id,
          before: { contactNumber: user.contactNumber },
          after: { contactNumber: newContactNumber },
          description: `${session.fullName} requested a contact number change`,
        });

        successMessages.push("Contact number change request submitted for review.");
      }
    }
  }

  revalidatePath("/employee/profile");

  return {
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    successMessages,
  };
}
