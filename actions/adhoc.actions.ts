"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import { startOfToday } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { Role, AuditActionType } from "@/lib/constants/enums";

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

  const request = await prisma.adHocRequest.create({
    data: {
      employeeId: session.id,
      date: startOfToday(),
      arrivalTime,
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    },
  });

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.ADHOC_SUBMITTED,
    entityType: "AdHocRequest",
    entityId: request.id,
    after: { arrivalTime, reason: request.reason },
    description: `${session.fullName} submitted an ad-hoc transport request for today at ${arrivalTime}`,
  });

  revalidatePath("/employee/adhoc");
  revalidatePath("/operations/adhoc");
  revalidatePath("/facilities/adhoc");
  return { success: true };
}
