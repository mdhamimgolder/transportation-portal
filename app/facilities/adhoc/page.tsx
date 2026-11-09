import { requireRole } from "@/lib/rbac/guards";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  addUtcCalendarDays,
  getMondayOfWeek,
  startOfToday,
} from "@/lib/date/week";
import { getActiveVehicleDrivers } from "@/lib/queries/fleet";
import { AdHocList } from "@/components/facilities/adhoc-list";

export default async function FacilitiesAdHocPage() {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  // Only active work stays here. Vehicle assignments move to Allocation History.
  const today = startOfToday();
  const weekStart = getMondayOfWeek(today);
  const nextWeekStart = addUtcCalendarDays(weekStart, 7);
  const [requests, resolvedThisWeekCount, declinedCount, vehicleDrivers] = await Promise.all([
    prisma.adHocRequest.findMany({
      where: {
        date: today,
        status: {
          in: [AdHocStatus.PENDING, AdHocStatus.APPROVED, AdHocStatus.REJECTED],
        },
      },
      include: {
        employee: true,
        routeAssignment: { include: { vehicleDriver: true } },
      },
      orderBy: { createdAt: "desc" },
      // Bounded: rejected rows accumulate forever; the newest 500 cover
      // every realistic working set.
      take: 500,
    }),
    prisma.routeAssignment.count({
      where: {
        adHocRequestId: { not: null },
        assignedAt: { gte: weekStart, lt: nextWeekStart },
      },
    }),
    prisma.adHocRequest.count({
      where: {
        OR: [
          { status: AdHocStatus.REJECTED },
          {
            status: AdHocStatus.RESOLVED,
            facilitiesComment: { not: null },
            routeAssignment: { is: null },
          },
        ],
      },
    }),
    getActiveVehicleDrivers(),
  ]);

  const options = vehicleDrivers.map((v) => ({
    id: v.id,
    driverName: v.driverName,
    contactNumber: v.contactNumber,
    vehicleNumber: v.vehicleNumber,
    vendor: v.vendor,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ad-hoc Transport</h1>
        <p className="text-sm text-muted-foreground">
          Assign vehicles or send employee notes. Saved assignments move to
          Allocation History.
        </p>
      </div>

      <AdHocList
        requests={requests}
        options={options}
        resolvedThisWeekCount={resolvedThisWeekCount}
        declinedCount={declinedCount}
      />
    </div>
  );
}