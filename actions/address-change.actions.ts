"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import {
  Role,
  AuditActionType,
  AddressChangeStatus,
} from "@/lib/constants/enums";

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
    include: { employee: true },
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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.ADDRESS_CHANGE_APPROVED,
    entityType: "AddressChangeRequest",
    entityId: request.id,
    before: { address: request.oldAddress },
    after: { address: request.newAddress },
    description: `${session.fullName} approved ${request.employee.fullName}'s address change`,
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
    include: { employee: true },
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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.ADDRESS_CHANGE_REJECTED,
    entityType: "AddressChangeRequest",
    entityId: request.id,
    before: { status: request.status },
    after: { status: AddressChangeStatus.REJECTED, reason: reason.trim() },
    description: `${session.fullName} rejected ${request.employee.fullName}'s address change: ${reason.trim()}`,
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return { success: true };
}
