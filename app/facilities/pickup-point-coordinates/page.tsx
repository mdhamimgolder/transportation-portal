import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { PickupPointCoordinates } from "@/components/facilities/pickup-point-coordinates";

export default async function PickupPointCoordinatesPage() {
  await requireRole([Role.FACILITIES]);
  const users = await prisma.user.findMany({
    where: { role: { in: [Role.EMPLOYEE, Role.FIXED_ARRIVAL] }, pickupPoint: { not: null } },
    select: { pickupPoint: true, pickupAddress: true },
    orderBy: { pickupPoint: "asc" },
  });
  const pickupPointNames = [...new Set(users.map((user) => user.pickupPoint).filter((name): name is string => Boolean(name)))];
  const addresses = await prisma.address.findMany({
    where: { addressText: { in: pickupPointNames } },
    select: { addressText: true, latitude: true, longitude: true },
  });
  const addressesByText = new Map(addresses.map((address) => [address.addressText, address]));
  const points = Array.from(new Map(users.map((user) => [user.pickupPoint, user])).values()).map((user) => {
    const fallbackAddress = user.pickupPoint ? addressesByText.get(user.pickupPoint) : undefined;
    const address = user.pickupAddress ?? fallbackAddress;
    return {
      name: user.pickupPoint ?? "",
      latitude: address?.latitude ?? null,
      longitude: address?.longitude ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pick-up Point Coordinates</h1>
        <p className="text-sm text-muted-foreground">Set coordinates once for each shared pick-up point. Employees using that point will inherit the saved location.</p>
      </div>
      <PickupPointCoordinates points={points} />
    </div>
  );
}