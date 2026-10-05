"use server";

import { escapeHtml } from "@/lib/html";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import {
  Role,
  PickupPointChangeStatus,
  OFFICE_LOCATIONS,
} from "@/lib/constants/enums";
import type { OfficeLocation } from "@/lib/constants/enums";
import {
  notificationRecipients,
} from "@/lib/constants/notification-recipients";
import { sendMailBackground } from "@/lib/mailer";
import { sanitizedActionMessage } from "@/lib/actions/action-error";
import { audit } from "@/lib/audit";

export type UpdateProfileState = {
  errors?: {
    pickupPoint?: string;
    address?: string;
    contactNumber?: string;
    officeLocation?: string;
  };
  successMessages?: string[];
};

const ADDRESS_CHANGE_LOCK_DAYS = 30;

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const session = await requireRole([Role.EMPLOYEE, Role.CORPORATE_EMPLOYEE]);

  try {
  const pickupPointRaw = formData.get("pickupPoint");
  const addressRaw = formData.get("address");
  const contactNumberRaw = formData.get("contactNumber");
  const officeLocationRaw = formData.get("officeLocation");

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
        const changeRequest = await prisma.pickupPointChangeRequest.create({
          data: {
            employeeId: session.id,
            oldPickupPoint: user.pickupPoint ?? "",
            newPickupPoint,
          },
        });
        await audit(session, {
          action: "REQUEST_PICKUP_POINT_CHANGE",
          entityType: "PickupPointChangeRequest",
          entityId: changeRequest.id,
          before: { pickupPoint: user.pickupPoint },
          after: { pickupPoint: newPickupPoint },
          description: `${user.fullName} requested a pick-up point change to "${newPickupPoint}"`,
        });

        successMessages.push("Pick-up point change request submitted for review.");
      }
    }
  }

  // Address: applied immediately (no approval), notifies Facilities + Operations.
  // Blocked if changed more recently than ADDRESS_CHANGE_LOCK_DAYS.
  if (typeof addressRaw === "string") {
    const newAddress = addressRaw.trim();
    if (newAddress !== (user.address ?? "").trim() && newAddress.length > 0) {
      const lockDays = user.addressChangedAt
        ? daysSince(user.addressChangedAt)
        : null;
      if (lockDays !== null && lockDays < ADDRESS_CHANGE_LOCK_DAYS) {
        errors.address = `You cannot change your address again. Wait ${ADDRESS_CHANGE_LOCK_DAYS - lockDays} more day(s).`;
      } else {
        const oldAddress = user.address ?? "";
        const updated = await prisma.user.update({
          where: { id: session.id },
          data: { address: newAddress, addressChangedAt: new Date() },
        });
        await audit(session, {
          action: "CHANGE_ADDRESS",
          entityType: "User",
          entityId: session.id,
          before: { address: user.address, addressChangedAt: user.addressChangedAt },
          after: { address: newAddress, addressChangedAt: updated.addressChangedAt },
          description: `${updated.fullName} changed their address`,
        });

        const recipients = [
          notificationRecipients.facilitiesNotificationEmail,
          notificationRecipients.operationsNotificationEmail,
        ].filter((email) => email.length > 0);
        after(async () => {
          await Promise.allSettled(
            recipients.map((to) =>
              sendMailBackground({
                to,
                subject: `Address changed: ${updated.fullName}`,
                body: `Hi,\n\n${updated.fullName} (${updated.email}) has changed their address.\n\nOld address: ${oldAddress}\nNew address: ${newAddress}\n\nBest regards,\nTransportation Team`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="height: 4px; background: #70bccc; border-radius: 4px 4px 0 0;"></div>
                    <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 4px 4px; padding: 32px;">
                      <h2 style="color: #1a1a2e; margin: 0 0 8px;">Address Changed</h2>
                      <p><strong>${escapeHtml(updated.fullName)}</strong> (${escapeHtml(updated.email)}) has changed their address.</p>
                      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                        <tr style="background: #f8f9fa;">
                          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold; width: 120px;">Old address</td>
                          <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(oldAddress || "—")}</td>
                        </tr>
                        <tr style="background: #f8f9fa;">
                          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">New address</td>
                          <td style="padding: 10px; border: 1px solid #dee2e6;">${escapeHtml(newAddress)}</td>
                        </tr>
                      </table>
                      <p style="color: #6c757d; margin-top: 24px;">Best regards,<br><strong>Transportation Team</strong></p>
                    </div>
                  </div>
                `,
              })
            )
          );
        });

        successMessages.push("Your address has been updated.");
      }
    }
  }

  // Contact number: applied immediately (no approval).
  if (typeof contactNumberRaw === "string") {
    const newContactNumber = contactNumberRaw.trim();
    if (
      newContactNumber !== (user.contactNumber ?? "").trim() &&
      newContactNumber.length > 0
    ) {
      await prisma.user.update({
        where: { id: session.id },
        data: { contactNumber: newContactNumber },
      });
      await audit(session, {
        action: "UPDATE_PROFILE",
        entityType: "User",
        entityId: session.id,
        before: { contactNumber: user.contactNumber },
        after: { contactNumber: newContactNumber },
        description: `${user.fullName} updated their contact number`,
      });
      successMessages.push("Your contact number has been updated.");
    }
  }

  // Office location: applied immediately (no approval).
  if (typeof officeLocationRaw === "string") {
    const newOfficeLocation = officeLocationRaw.trim();
    if (newOfficeLocation.length > 0) {
      if (newOfficeLocation !== (user.officeLocation ?? "").trim()) {
        if (!OFFICE_LOCATIONS.includes(newOfficeLocation as OfficeLocation)) {
          errors.officeLocation = "Select a valid office location.";
        } else {
          await prisma.user.update({
            where: { id: session.id },
            data: { officeLocation: newOfficeLocation },
          });
          await audit(session, {
            action: "UPDATE_PROFILE",
            entityType: "User",
            entityId: session.id,
            before: { officeLocation: user.officeLocation },
            after: { officeLocation: newOfficeLocation },
            description: `${user.fullName} updated their office location`,
          });
          successMessages.push("Your office location has been updated.");
        }
      }
    }
  }

  revalidatePath("/employee/profile");
  revalidatePath("/corporate-employee/profile");

  return {
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    successMessages,
  };
  } catch (error) {
    return {
      errors: { address: sanitizedActionMessage("updateProfile", error) },
    };
  }
}
