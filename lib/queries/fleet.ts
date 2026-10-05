import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Reference fleet reads shared by the Facilities pages (Vehicles & Drivers,
 * Ad-hoc assignment, Pick Schedule, Route Setting). Explicit scalar selects
 * keep every payload JSON-safe (no Dates/relations) so cached and uncached
 * reads return identical shapes.
 */

export type ActiveVehicleDriver = {
  id: string;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  vendor: string;
};

/**
 * Active vehicle/driver master list — read by four Facilities pages with the
 * same filter/order. One cached entry instead of a full-table scan per page
 * view. Invalidated by every vehicle-driver mutation via
 * `invalidateCacheTag(CACHE_TAGS.vehicles)`; `revalidate` is only a backstop.
 */
const fetchActiveVehicleDrivers = unstable_cache(
  async (): Promise<ActiveVehicleDriver[]> => {
    return prisma.vehicleDriver.findMany({
      where: { isActive: true },
      select: {
        id: true,
        driverName: true,
        contactNumber: true,
        vehicleNumber: true,
        vendor: true,
      },
      orderBy: { driverName: "asc" },
    });
  },
  ["active-vehicle-drivers"],
  { tags: [CACHE_TAGS.vehicles], revalidate: 300 }
);

export async function getActiveVehicleDrivers(): Promise<
  ActiveVehicleDriver[]
> {
  return fetchActiveVehicleDrivers();
}
