"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { startOfToday } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { Role, AdHocStatus } from "@/lib/constants/enums";

export type SubmitAdHocRequestState = {
  error?: string;
  success?: boolean;
};

const VALID_ARRIVAL_TIMES = new Set(
  ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => o.value)
);

export async function submitAdHocRequest(
  _prevState: SubmitAdHocRequestState,
  formData: FormData
): Promise<SubmitAdHocRequestState> {
  const session = await requireRole([Role.EMPLOYEE]);

  const arrivalTime = formData.get("arrivalTime");
  const reason = formData.get("reason");

  if (typeof arrivalTime !== "string" || !VALID_ARRIVAL_TIMES.has(arrivalTime)) {
    return { error: "Please select a valid arrival time." };
  }

  const today = startOfToday();

  const existingWeeklyDay = await prisma.weeklyScheduleDay.findFirst({
    where: {
      date: today,
      needsTransport: true,
      weeklySchedule: { employeeId: session.id },
    },
  });

  if (existingWeeklyDay && existingWeeklyDay.arrivalTime === arrivalTime) {
    return {
      error:
        "You already have a weekly schedule with this arrival time for today. Choose a different arrival time to submit an ad-hoc request.",
    };
  }

  await prisma.adHocRequest.create({
    data: {
      employeeId: session.id,
      date: today,
      arrivalTime,
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    },
  });

  revalidatePath("/employee/adhoc");
  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  return { success: true };
}

export type ApproveAdHocRequestState = {
  error?: string;
};

export async function approveAdHocRequest(
  _prevState: ApproveAdHocRequestState,
  formData: FormData
): Promise<ApproveAdHocRequestState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }

  const request = await prisma.adHocRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== AdHocStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.adHocRequest.update({
    where: { id: requestId },
    data: {
      status: AdHocStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  return {};
}

export type ApproveAdHocRequestsState = {
  error?: string;
};

export async function approveAdHocRequests(
  _prevState: ApproveAdHocRequestsState,
  formData: FormData
): Promise<ApproveAdHocRequestsState> {
  const session = await requireRole([Role.OPERATIONS]);

  const ids = formData.getAll("requestId").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) {
    return { error: "Select at least one request to approve." };
  }

  const requests = await prisma.adHocRequest.findMany({
    where: { id: { in: ids }, status: AdHocStatus.PENDING },
  });

  for (const request of requests) {
    await prisma.adHocRequest.update({
      where: { id: request.id },
      data: {
        status: AdHocStatus.APPROVED,
        reviewedById: session.id,
        reviewedAt: new Date(),
      },
    });
  }

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  return {};
}

export type RejectAdHocRequestState = {
  error?: string;
  success?: boolean;
};

export async function rejectAdHocRequest(
  _prevState: RejectAdHocRequestState,
  formData: FormData
): Promise<RejectAdHocRequestState> {
  const session = await requireRole([Role.OPERATIONS]);

  const requestId = formData.get("requestId");
  const reason = formData.get("reason");

  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "A rejection reason is required." };
  }

  const request = await prisma.adHocRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    return { error: "Request not found." };
  }
  if (request.status !== AdHocStatus.PENDING) {
    return { error: "This request has already been reviewed." };
  }

  await prisma.adHocRequest.update({
    where: { id: requestId },
    data: {
      status: AdHocStatus.REJECTED,
      rejectReason: reason.trim(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  return { success: true };
}
