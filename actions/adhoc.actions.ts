"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { startOfToday } from "@/lib/date/week";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { Role } from "@/lib/constants/enums";

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
