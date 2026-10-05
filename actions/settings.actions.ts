"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { SETTINGS_ID } from "@/lib/queries/settings";
import { sanitizedActionError } from "@/lib/actions/action-error";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { invalidateCacheTag } from "@/lib/cache-invalidate";
import { audit } from "@/lib/audit";

export type UpdateWeeklyLockState = {
  error?: string;
  success?: boolean;
};

export async function updateWeeklyLockSettingAction(
  _prevState: UpdateWeeklyLockState,
  formData: FormData
): Promise<UpdateWeeklyLockState> {
  const session = await requireRole([Role.SUPER_ADMIN]);

  try {
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

  invalidateCacheTag(CACHE_TAGS.settings);
  await audit(session, {
    action: "UPDATE_WEEKLY_LOCK",
    entityType: "TransportSettings",
    entityId: SETTINGS_ID,
    after: { weeklyLockDayOfWeek: dayOfWeek, weeklyLockHour: hour, weeklyLockMinute: minute },
    description: `${session.fullName} set the weekly submission lock to day ${dayOfWeek} at ${time}`,
  });

  revalidatePath("/super-admin/settings");
  revalidatePath("/operations/weekly-requests");
  return { success: true };
  } catch (error) {
    return sanitizedActionError("updateWeeklyLockSettingAction", error);
  }
}
