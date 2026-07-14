"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role, AddressChangeStatus } from "@/lib/constants/enums";

export type ApproveAddressChangeState = {
  error?: string;
};

export async function approveAddressChange(
  _prevState: ApproveAddressChangeState,
  formData: FormData
): Promise<ApproveAddressChangeState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }

  const request = await prisma.addressChangeRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== AddressChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.addressChangeRequest.update({
    where: { id: requestId },
    data: {
      status: AddressChangeStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: request.employeeId },
    data: { address: request.newAddress },
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return {};
}

export type RejectAddressChangeState = {
  error?: string;
  success?: boolean;
};

export async function rejectAddressChange(
  _prevState: RejectAddressChangeState,
  formData: FormData
): Promise<RejectAddressChangeState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  const reason = formData.get("reason");

  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "A rejection reason is required." };
  }

  const request = await prisma.addressChangeRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== AddressChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.addressChangeRequest.update({
    where: { id: requestId },
    data: {
      status: AddressChangeStatus.REJECTED,
      rejectReason: reason.trim(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return { success: true };
}
