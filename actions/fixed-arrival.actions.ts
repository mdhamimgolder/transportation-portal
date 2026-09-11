"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import {
  ARRIVAL_TIME_OPTIONS,
  NO_TRANSPORT_VALUE,
  normalizeArrivalTimeInput,
} from "@/lib/constants/arrival-times";

export type SaveFixedArrivalState = {
  error?: string;
  success?: boolean;
};

const VALID_VALUES = new Set(ARRIVAL_TIME_OPTIONS.map((o) => o.value));

/**
 * The one-time arrival selection for a FIXED_ARRIVAL employee. Picking a time
 * locks it permanently on the user's record (User.fixedArrivalTime) — every
 * RUN MAPPING then auto-includes this employee with that arrival time. Only
 * Facilities can change it afterwards.
 */
export async function saveFixedArrivalTime(
  _prevState: SaveFixedArrivalState,
  formData: FormData
): Promise<SaveFixedArrivalState> {
  try {
    const session = await requireRole([Role.FIXED_ARRIVAL]);

    const raw = formData.get("arrivalTime");
    const value = typeof raw === "string" ? (raw as string).trim() : "";
    if (!value) return { error: "Please choose an arrival time." };

    const normalized = normalizeArrivalTimeInput(value);
    if (!normalized || normalized === NO_TRANSPORT_VALUE || !VALID_VALUES.has(normalized)) {
      return { error: "Please pick a valid arrival time (10 PM through 6 AM)." };
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.id },
      select: { fixedArrivalTime: true },
    });
    if (user.fixedArrivalTime) {
      const label =
        ARRIVAL_TIME_OPTIONS.find((o) => o.value === user.fixedArrivalTime)?.label ??
        user.fixedArrivalTime;
      return {
        error: `Your arrival time is already fixed at ${label} — only Facilities can change it.`,
      };
    }

    await prisma.user.update({
      where: { id: session.id },
      data: { fixedArrivalTime: normalized },
    });

    revalidatePath("/fixed-arrival/my-schedule");
    revalidatePath("/fixed-arrival/dashboard");
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save your arrival time.",
    };
  }
}
