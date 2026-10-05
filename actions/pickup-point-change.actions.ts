"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { sanitizedActionError } from "@/lib/actions/action-error";
import { audit, auditEntry } from "@/lib/audit";
import { Role, PickupPointChangeStatus } from "@/lib/constants/enums";

export type ApprovePickupPointChangeState = {
  error?: string;
};

export async function approvePickupPointChange(
  _prevState: ApprovePickupPointChangeState,
  formData: FormData
): Promise<ApprovePickupPointChangeState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
    const requestId = formData.get("requestId");
    if (typeof requestId !== "string" || !requestId) {
      return { error: "Missing request." };
    }

  const request = await prisma.pickupPointChangeRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== PickupPointChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  // Atomic PENDING → APPROVED transition: the status guard in the WHERE makes a
  // concurrent second review a no-op (count 0), and the user update + audit row
  // commit in the same transaction as the status change.
  const [transition] = await prisma.$transaction([
    prisma.pickupPointChangeRequest.updateMany({
      where: { id: requestId, status: PickupPointChangeStatus.PENDING },
      data: {
        status: PickupPointChangeStatus.APPROVED,
        reviewedById: session.id,
        reviewedAt: new Date(),
      },
    }),
    prisma.user.updateMany({
      where: {
        id: request.employeeId,
        pickupPointChangeRequests: {
          some: { id: requestId, status: PickupPointChangeStatus.APPROVED, reviewedById: session.id },
        },
      },
      data: { pickupPoint: request.newPickupPoint },
    }),
    auditEntry(session, {
      action: "APPROVE_PICKUP_POINT_CHANGE",
      entityType: "PickupPointChangeRequest",
      entityId: requestId,
      before: { status: request.status, pickupPoint: request.oldPickupPoint },
      after: { status: PickupPointChangeStatus.APPROVED, pickupPoint: request.newPickupPoint },
      description: `${session.fullName} approved a pick-up point change for employee ${request.employeeId}: "${request.oldPickupPoint}" → "${request.newPickupPoint}"`,
    }),
  ]);
  if (transition.count === 0) {
    return { error: "This request was already reviewed." };
  }

  revalidatePath("/facilities/profile-approvals");
  revalidatePath("/employee/profile");
  return {};
  } catch (error) {
    return sanitizedActionError("approvePickupPointChange", error);
  }
}

export type RejectPickupPointChangeState = {
  error?: string;
  success?: boolean;
};

export async function rejectPickupPointChange(
  _prevState: RejectPickupPointChangeState,
  formData: FormData
): Promise<RejectPickupPointChangeState> {
  const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  try {
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
  });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== PickupPointChangeStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  const rejectReason = reason.trim();
  // Atomic PENDING → REJECTED transition (count 0 = a concurrent review won).
  const transition = await prisma.pickupPointChangeRequest.updateMany({
    where: { id: requestId, status: PickupPointChangeStatus.PENDING },
    data: {
      status: PickupPointChangeStatus.REJECTED,
      rejectReason,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });
  if (transition.count === 0) {
    return { error: "This request was already reviewed." };
  }

  await audit(session, {
    action: "REJECT_PICKUP_POINT_CHANGE",
    entityType: "PickupPointChangeRequest",
    entityId: requestId,
    before: { status: request.status },
    after: { status: PickupPointChangeStatus.REJECTED, rejectReason },
    description: `${session.fullName} rejected a pick-up point change for employee ${request.employeeId} ("${request.oldPickupPoint}" → "${request.newPickupPoint}")`,
  });

  revalidatePath("/facilities/profile-approvals");
  revalidatePath("/employee/profile");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("rejectPickupPointChange", error);
  }
}
