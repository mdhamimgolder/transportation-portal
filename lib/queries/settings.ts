import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/cache-tags";

export const SETTINGS_ID = "singleton";

export type TransportSettings = {
  weeklyLockDayOfWeek: number;
  weeklyLockHour: number;
  weeklyLockMinute: number;
};

const DEFAULT_SETTINGS: TransportSettings = {
  weeklyLockDayOfWeek: 6,
  weeklyLockHour: 12,
  weeklyLockMinute: 0,
};

/**
 * The singleton settings row is read on most Operations/Employee pages (the
 * weekly submission deadline) but changes only when Super Admin edits it —
 * cached under the `settings` tag and busted by `updateWeeklyLockSettingAction`.
 */
const fetchTransportSettings = unstable_cache(
  async (): Promise<TransportSettings> => {
    const settings = await prisma.transportSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { weeklyLockDayOfWeek: true, weeklyLockHour: true, weeklyLockMinute: true },
    });
    return settings ?? DEFAULT_SETTINGS;
  },
  ["transport-settings"],
  { tags: [CACHE_TAGS.settings], revalidate: 3600 }
);

export async function getTransportSettings(): Promise<TransportSettings> {
  return fetchTransportSettings();
}
