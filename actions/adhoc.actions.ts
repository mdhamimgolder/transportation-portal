"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { startOfToday } from "@/lib/date/week";
import {
  ADHOC_ARRIVAL_TIME_OPTIONS,
  ADHOC_PICKUP_REQUIRED_TIME,
  isAdhocArrivalEligible,
} from "@/lib/constants/adhoc-arrival-times";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { sanitizedActionError } from "@/lib/actions/action-error";
import { audit } from "@/lib/audit";

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
  const session = await requireRole([Role.EMPLOYEE, Role.CORPORATE_EMPLOYEE]);

  try {
  const arrivalTime = formData.get("arrivalTime");
  const reason = formData.get("reason");

  if (typeof arrivalTime !== "string" || !VALID_ARRIVAL_TIMES.has(arrivalTime)) {
    return { error: "Please select a valid arrival time." };
  }

  const today = startOfToday();

  if (!isAdhocArrivalEligible(today, arrivalTime)) {
    return {
      error:
        "Ad-hoc requests need at least 3 hours' notice. Please choose a later arrival time.",
    };
  }

  // Independent reads — fetch concurrently (the pick-up point is only needed
  // for the late-night slot).
  const [user, existingWeeklyDay] = await Promise.all([
    arrivalTime === ADHOC_PICKUP_REQUIRED_TIME
      ? prisma.user.findUnique({
          where: { id: session.id },
          select: { pickupPoint: true },
        })
      : null,
    prisma.weeklyScheduleDay.findFirst({
      where: {
        date: today,
        needsTransport: true,
        weeklySchedule: { employeeId: session.id },
      },
      select: { arrivalTime: true },
    }),
  ]);

  if (arrivalTime === ADHOC_PICKUP_REQUIRED_TIME && !user?.pickupPoint) {
    return {
      error:
        "Pick-up Point is required for a 10:00 PM arrival. Update your pick-up point in your profile first.",
    };
  }

  if (existingWeeklyDay && existingWeeklyDay.arrivalTime === arrivalTime) {
    return {
      error:
        "You already have a weekly schedule with this arrival time for today. Choose a different arrival time to submit an ad-hoc request.",
    };
  }

  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;
  // No Operations review step -- employee ad-hoc requests land as already
  // approved so they reach Facilities (and Operations monitoring) directly.
  const created = await prisma.adHocRequest.create({
    data: {
      employeeId: session.id,
      date: today,
      arrivalTime,
      reason: cleanReason,
      status: AdHocStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
    select: { id: true, status: true },
  });

  await audit(session, {
    action: "SUBMIT_ADHOC_REQUEST",
    entityType: "AdHocRequest",
    entityId: created.id,
    after: { date: today, arrivalTime, reason: cleanReason, status: created.status },
    description: `${session.fullName} submitted an ad-hoc request for ${today.toDateString()} (arrival ${arrivalTime}, auto-approved).`,
  });

  revalidatePath("/employee/adhoc");
  revalidatePath("/corporate-employee/adhoc");
  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("submitAdHocRequest", error);
  }
}

export type ApproveAdHocRequestState = {
  error?: string;
};

export async function approveAdHocRequest(
  _prevState: ApproveAdHocRequestState,
  formData: FormData
): Promise<ApproveAdHocRequestState> {
  const session = await requireRole([Role.OPERATIONS]);

  try {
  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }

  const request = await prisma.adHocRequest.findUnique({
    where: { id: requestId },
    select: { date: true, arrivalTime: true, employee: { select: { fullName: true } } },
  });
  if (!request) {
    return { error: "Request not found." };
  }

  // Atomic PENDING -> APPROVED transition (guards against a concurrent review).
  const { count } = await prisma.adHocRequest.updateMany({
    where: { id: requestId, status: AdHocStatus.PENDING },
    data: {
      status: AdHocStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });
  if (count !== 1) {
    return { error: "This request has already been reviewed." };
  }

  await audit(session, {
    action: "APPROVE_ADHOC_REQUEST",
    entityType: "AdHocRequest",
    entityId: requestId,
    before: { status: AdHocStatus.PENDING },
    after: { status: AdHocStatus.APPROVED },
    description: `${session.fullName} approved ${request.employee.fullName}'s ad-hoc request for ${request.date.toDateString()} (arrival ${request.arrivalTime}).`,
  });

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  revalidatePath("/corporate-employee/adhoc");
  return {};
  } catch (error) {
    return sanitizedActionError("approveAdHocRequest", error);
  }
}

export type ApproveAdHocRequestsState = {
  error?: string;
};

export async function approveAdHocRequests(
  _prevState: ApproveAdHocRequestsState,
  formData: FormData
): Promise<ApproveAdHocRequestsState> {
  const session = await requireRole([Role.OPERATIONS]);

  try {
  const ids = formData.getAll("requestId").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) {
    return { error: "Select at least one request to approve." };
  }

  // Single batched write — only PENDING rows transition (same semantics as
  // the previous per-row loop, without N round trips).
  const { count } = await prisma.adHocRequest.updateMany({
    where: { id: { in: ids }, status: AdHocStatus.PENDING },
    data: {
      status: AdHocStatus.APPROVED,
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });

  if (count > 0) {
    await audit(session, {
      action: "APPROVE_ADHOC_REQUESTS",
      entityType: "AdHocRequest",
      before: { status: AdHocStatus.PENDING, requestedIds: ids },
      after: { status: AdHocStatus.APPROVED, approvedCount: count },
      description: `${session.fullName} approved ${count} ad-hoc request${count === 1 ? "" : "s"}.`,
    });
  }

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  revalidatePath("/corporate-employee/adhoc");
  return {};
  } catch (error) {
    return sanitizedActionError("approveAdHocRequests", error);
  }
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

  try {
  const requestId = formData.get("requestId");
  const reason = formData.get("reason");

  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "A rejection reason is required." };
  }

  const request = await prisma.adHocRequest.findUnique({
    where: { id: requestId },
    select: { date: true, arrivalTime: true, employee: { select: { fullName: true } } },
  });
  if (!request) {
    return { error: "Request not found." };
  }

  // Atomic PENDING -> REJECTED transition (guards against a concurrent review).
  const { count } = await prisma.adHocRequest.updateMany({
    where: { id: requestId, status: AdHocStatus.PENDING },
    data: {
      status: AdHocStatus.REJECTED,
      rejectReason: reason.trim(),
      reviewedById: session.id,
      reviewedAt: new Date(),
    },
  });
  if (count !== 1) {
    return { error: "This request has already been reviewed." };
  }

  await audit(session, {
    action: "REJECT_ADHOC_REQUEST",
    entityType: "AdHocRequest",
    entityId: requestId,
    before: { status: AdHocStatus.PENDING },
    after: { status: AdHocStatus.REJECTED, rejectReason: reason.trim() },
    description: `${session.fullName} rejected ${request.employee.fullName}'s ad-hoc request for ${request.date.toDateString()} (arrival ${request.arrivalTime}).`,
  });

  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  revalidatePath("/employee/adhoc");
  revalidatePath("/corporate-employee/adhoc");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("rejectAdHocRequest", error);
  }
}
