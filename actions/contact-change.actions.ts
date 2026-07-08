"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import {
  Role,
  AuditActionType,
  ContactChangeStatus,
} from "@/lib/constants/enums";

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
    include: { employee: true },
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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.CONTACT_CHANGE_APPROVED,
    entityType: "ContactChangeRequest",
    entityId: request.id,
    before: { contactNumber: request.oldContactNumber },
    after: { contactNumber: request.newContactNumber },
    description: `${session.fullName} approved ${request.employee.fullName}'s contact number change`,
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
    include: { employee: true },
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

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.CONTACT_CHANGE_REJECTED,
    entityType: "ContactChangeRequest",
    entityId: request.id,
    before: { status: request.status },
    after: { status: ContactChangeStatus.REJECTED, reason: reason.trim() },
    description: `${session.fullName} rejected ${request.employee.fullName}'s contact number change: ${reason.trim()}`,
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return { success: true };
}
