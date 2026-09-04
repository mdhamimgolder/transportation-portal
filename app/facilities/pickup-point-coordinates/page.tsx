import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { PickupPointCoordinates } from "@/components/facilities/pickup-point-coordinates";

export default async function PickupPointCoordinatesPage() {
  await requireRole([Role.FACILITIES]);
  const users = await prisma.user.findMany({
    where: { role: Role.EMPLOYEE, pickupPoint: { not: null } },
    select: { pickupPoint: true, pickupAddress: true },
    orderBy: { pickupPoint: "asc" },
  });
  const points = Array.from(new Map(users.map((user) => [user.pickupPoint, user])).values()).map((user) => ({
    name: user.pickupPoint ?? "",
    latitude: user.pickupAddress?.latitude ?? null,
    longitude: user.pickupAddress?.longitude ?? null,
  }));

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