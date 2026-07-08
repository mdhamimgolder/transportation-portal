"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import {
  Role,
  AuditActionType,
  PickupPointChangeStatus,
} from "@/lib/constants/enums";

export type ApprovePickupPointChangeState = {
  error?: string;
};

export async function approvePickupPointChange(
  _prevState: ApprovePickupPointChangeState,
  formData: FormData
): Promise<ApprovePickupPointChangeState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }

  const request = await prisma.pickupPointChangeRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== PickupPointChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.pickupPointChangeRequest.update({
    where: { id: requestId },
    data: {
      status: PickupPointChangeStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: request.employeeId },
    data: { pickupPoint: request.newPickupPoint },
  });

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.PICKUP_POINT_CHANGE_APPROVED,
    entityType: "PickupPointChangeRequest",
    entityId: request.id,
    before: { pickupPoint: request.oldPickupPoint },
    after: { pickupPoint: request.newPickupPoint },
    description: `${session.fullName} approved ${request.employee.fullName}'s pick-up point change`,
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return {};
}

export type RejectPickupPointChangeState = {
  error?: string;
  success?: boolean;
};

export async function rejectPickupPointChange(
  _prevState: RejectPickupPointChangeState,
  formData: FormData
): Promise<RejectPickupPointChangeState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  const reason = formData.get("reason");

  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "A rejection reason is required." };
  }

  const request = await prisma.pickupPointChangeRequest.findUnique({
    where: { id: requestId },
    include: { employee: true },
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== PickupPointChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.pickupPointChangeRequest.update({
    where: { id: requestId },
    data: {
      status: PickupPointChangeStatus.REJECTED,
      rejectReason: reason.trim(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.PICKUP_POINT_CHANGE_REJECTED,
    entityType: "PickupPointChangeRequest",
    entityId: request.id,
    before: { status: request.status },
    after: { status: PickupPointChangeStatus.REJECTED, reason: reason.trim() },
    description: `${session.fullName} rejected ${request.employee.fullName}'s pick-up point change: ${reason.trim()}`,
  });

  revalidatePath("/operations/profile-approvals");
  revalidatePath("/employee/profile");
  return { success: true };
}
