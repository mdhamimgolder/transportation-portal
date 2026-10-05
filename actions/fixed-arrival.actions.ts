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
import { sanitizedActionError } from "@/lib/actions/action-error";
import { audit } from "@/lib/audit";

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
  const session = await requireRole([Role.FIXED_ARRIVAL]);

  try {
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

    // Lock-once guard in the WHERE: a concurrent double-submit can only set it once.
    const locked = await prisma.user.updateMany({
      where: { id: session.id, fixedArrivalTime: null },
      data: { fixedArrivalTime: normalized },
    });
    if (locked.count === 0) {
      return { error: "Your arrival time is already fixed — only Facilities can change it." };
    }
    await audit(session, {
      action: "SET_FIXED_ARRIVAL_TIME",
      entityType: "User",
      entityId: session.id,
      before: { fixedArrivalTime: null },
      after: { fixedArrivalTime: normalized },
      description: `${session.fullName} fixed their arrival time at ${normalized}`,
    });

    revalidatePath("/fixed-arrival/my-schedule");
    revalidatePath("/fixed-arrival/dashboard");
    return { success: true };
  } catch (error) {
    return sanitizedActionError("saveFixedArrivalTime", error);
  }
}
