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

  // Pickup-point coordinates page fetches named addresses via these two queries
  const [vehicleDrivers, pins, pickupPointNames, linkedPointAddressIds] = await Promise.all([
    prisma.vehicleDriver.findMany({
      where: { isActive: true },
      select: { driverName: true, contactNumber: true, vehicleNumber: true },
      orderBy: { driverName: "asc" },
    }),
    getVehicleShiftPins(weekStart.toISOString().split("T")[0]),
    prisma.user.findMany({
      where: { role: { in: [Role.EMPLOYEE, Role.FIXED_ARRIVAL] }, pickupPoint: { not: null } },
      select: { pickupPoint: true },
    }),
    prisma.pickupPoint.findMany({
      where: { isActive: true },
      select: { addressId: true },
    }),
  ]);

  const pointNames = [
    ...new Set(
      pickupPointNames
        .map((u) => u.pickupPoint?.trim())
        .filter((n): n is string => Boolean(n))
    ),
  ];
  const linkedIds = linkedPointAddressIds.map((p) => p.addressId);

  // ONLY pickup points for "Add pickup point" — never employee home addresses.
  // A pickup point is a named point on the coordinates page (User.pickupPoint)
  // or an address already linked by an active vehicle PickupPoint.
  const addresses = await prisma.address.findMany({
    where: {
      OR: [
        ...(pointNames.length
          ? [{ addressText: { in: pointNames, mode: "insensitive" as const } }]
          : []),
        ...(linkedIds.length ? [{ id: { in: linkedIds } }] : []),
      ],
    },
    select: { id: true, addressText: true, label: true, latitude: true, longitude: true },
    orderBy: { addressText: "asc" },
  });

  await Promise.all(
    vehicleDrivers.map((record) =>
      prisma.vehicle.upsert({
        where: { vehicleNumber: record.vehicleNumber.trim() },
        update: {
          driverName: record.driverName,
          driverContact: record.contactNumber,
          isActive: true,
        },
        create: {
          vehicleNumber: record.vehicleNumber.trim(),
          vehicleType: "STANDARD",
          capacity: 4,
          driverName: record.driverName,
          driverContact: record.contactNumber,
          officeLocation: "Regnum",
        },
      })
    )
  );

  const vehicles = await prisma.vehicle.findMany({
    where: {
      isActive: true,
      vehicleNumber: {
        in: vehicleDrivers.map((record) => record.vehicleNumber.trim()),
      },
    },
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
  });

  const driverByVehicleNumber = new Map(
    vehicleDrivers.map((record) => [
      record.vehicleNumber.trim().toUpperCase(),
      record.driverName,
    ])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Route Setting</h1>
        <p className="text-sm text-muted-foreground">
          Pickup-point order (10 PM shift) and vehicle-to-shift pinning per
          week. Coordinates come from employee profiles and the Pick-up Points
          page.
        </p>
      </div>
      <RouteSettingClient
        initialWeekStart={weekStart.toISOString().split("T")[0]}
        vehicles={vehicles.map((v) => ({
          ...v,
          driverName:
            driverByVehicleNumber.get(v.vehicleNumber.trim().toUpperCase()) ??
            v.driverName,
          pickupPoints: v.pickupSequence,
        }))}
        addresses={addresses.map((a) => ({
          id: a.id,
          addressText: a.addressText,
          label: a.label,
          latitude: a.latitude,
          longitude: a.longitude,
        }))}
        pins={pins.error ? [] : pins.pins}
      />
    </div>
  );
}