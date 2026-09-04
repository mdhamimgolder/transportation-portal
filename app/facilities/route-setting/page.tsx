import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getMondayOfWeek, getSubmissionWindow } from "@/lib/date/week";
import { prisma } from "@/lib/prisma";
import { getVehicleShiftPins } from "@/actions/route-setting.actions";
import { RouteSettingClient } from "@/components/facilities/route-setting/route-setting-client";

export const dynamic = "force-dynamic";

function parseDayString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default async function RouteSettingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const params = await searchParams;
  const weekParam = typeof params.week === "string" && params.week ? params.week : undefined;
  const weekStart = weekParam
    ? getMondayOfWeek(parseDayString(weekParam))
    : getSubmissionWindow().weekStartDate;

  const [vehicles, pins, addresses] = await Promise.all([
    prisma.vehicle.findMany({
      where: { isActive: true },
      select: {
        id: true,
        vehicleNumber: true,
        vehicleType: true,
        capacity: true,
        driverName: true,
        driverContact: true,
        officeLocation: true,
        baseETA: true,
        firstPickupTime: true,
        pickupSequence: {
          where: { isActive: true },
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            name: true,
            sequence: true,
            baseETA: true,
            isActive: true,
            address: { select: { addressText: true, latitude: true, longitude: true } },
          },
        },
      },
      orderBy: { vehicleNumber: "asc" },
    }),
    getVehicleShiftPins(weekStart.toISOString().split("T")[0]),
    prisma.address.findMany({
      select: { id: true, addressText: true, label: true },
      orderBy: { addressText: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Route Setting</h1>
        <p className="text-sm text-muted-foreground">
          Pickup-point order (10 PM shift), vehicle-to-shift pinning per week,
          and address geocoding for the auto route planner.
        </p>
      </div>
      <RouteSettingClient
        initialWeekStart={weekStart.toISOString().split("T")[0]}
        vehicles={vehicles.map((v) => ({
          ...v,
          pickupPoints: v.pickupSequence,
        }))}
        addresses={addresses.map((a) => ({
          id: a.id,
          addressText: a.addressText,
          label: a.label,
        }))}
        pins={pins.error ? [] : pins.pins}
      />
    </div>
  );
}