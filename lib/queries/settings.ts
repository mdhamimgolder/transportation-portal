import "server-only";
import { prisma } from "@/lib/prisma";

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

export async function getTransportSettings(): Promise<TransportSettings> {
  const settings = await prisma.transportSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  return settings ?? DEFAULT_SETTINGS;
}
