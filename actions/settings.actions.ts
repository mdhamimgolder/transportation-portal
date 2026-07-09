"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { writeAuditLog } from "@/lib/audit/log";
import { Role, AuditActionType } from "@/lib/constants/enums";
import { SETTINGS_ID } from "@/lib/queries/settings";

export type UpdateWeeklyLockState = {
  error?: string;
  success?: boolean;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export async function updateWeeklyLockSettingAction(
  _prevState: UpdateWeeklyLockState,
  formData: FormData
): Promise<UpdateWeeklyLockState> {
  const session = await requireRole([Role.SUPER_ADMIN]);

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

  const before = await prisma.transportSettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  const updated = await prisma.transportSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { weeklyLockDayOfWeek: dayOfWeek, weeklyLockHour: hour, weeklyLockMinute: minute },
    create: {
      id: SETTINGS_ID,
      weeklyLockDayOfWeek: dayOfWeek,
      weeklyLockHour: hour,
      weeklyLockMinute: minute,
    },
  });

  await writeAuditLog({
    actor: { id: session.id, email: session.email, role: session.role },
    actionType: AuditActionType.SETTINGS_UPDATED,
    entityType: "TransportSettings",
    entityId: updated.id,
    before: before
      ? {
          day: DAY_NAMES[before.weeklyLockDayOfWeek],
          hour: before.weeklyLockHour,
          minute: before.weeklyLockMinute,
        }
      : undefined,
    after: { day: DAY_NAMES[dayOfWeek], hour, minute },
    description: `${session.fullName} set the weekly submission lock to ${DAY_NAMES[dayOfWeek]} ${time}`,
  });

  revalidatePath("/super-admin/settings");
  revalidatePath("/employee/weekly");
  revalidatePath("/employee/dashboard");
  return { success: true };
}
