"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { SETTINGS_ID } from "@/lib/queries/settings";

export type UpdateWeeklyLockState = {
  error?: string;
  success?: boolean;
};

export async function updateWeeklyLockSettingAction(
  _prevState: UpdateWeeklyLockState,
  formData: FormData
): Promise<UpdateWeeklyLockState> {
  await requireRole([Role.SUPER_ADMIN]);

  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const time = formData.get("time");

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: "Select a valid day." };
  }
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
    return { error: "Select a valid time." };
  }

  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  await prisma.transportSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { weeklyLockDayOfWeek: dayOfWeek, weeklyLockHour: hour, weeklyLockMinute: minute },
    create: {
      id: SETTINGS_ID,
      weeklyLockDayOfWeek: dayOfWeek,
      weeklyLockHour: hour,
      weeklyLockMinute: minute,
    },
  });

  revalidatePath("/super-admin/settings");
  revalidatePath("/operations/weekly-requests");
  return { success: true };
}
