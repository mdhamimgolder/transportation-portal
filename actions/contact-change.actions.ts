"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role, ContactChangeStatus } from "@/lib/constants/enums";

export type ApproveContactChangeState = {
  error?: string;
};

export async function approveContactChange(
  _prevState: ApproveContactChangeState,
  formData: FormData
): Promise<ApproveContactChangeState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }

  const request = await prisma.contactChangeRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== ContactChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.contactChangeRequest.update({
    where: { id: requestId },
    data: {
      status: ContactChangeStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: request.employeeId },
    data: { contactNumber: request.newContactNumber },
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return {};
}

export type RejectContactChangeState = {
  error?: string;
  success?: boolean;
};

export async function rejectContactChange(
  _prevState: RejectContactChangeState,
  formData: FormData
): Promise<RejectContactChangeState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  const reason = formData.get("reason");

  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "A rejection reason is required." };
  }

  const request = await prisma.contactChangeRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== ContactChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.contactChangeRequest.update({
    where: { id: requestId },
    data: {
      status: ContactChangeStatus.REJECTED,
      rejectReason: reason.trim(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return { success: true };
}
