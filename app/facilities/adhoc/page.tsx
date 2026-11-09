import { requireRole } from "@/lib/rbac/guards";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { getActiveVehicleDrivers } from "@/lib/queries/fleet";
import { AdHocList } from "@/components/facilities/adhoc-list";

export default async function FacilitiesAdHocPage() {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  // Keep active requests in the queue; assigned, cancelled, and resolved
  // requests are handled outside this work list.
  const [requests, vehicleDrivers] = await Promise.all([
    prisma.adHocRequest.findMany({
      where: {
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
    getActiveVehicleDrivers(),
  ]);

  const options = vehicleDrivers.map((v) => ({
    id: v.id,
    driverName: v.driverName,
    vehicleNumber: v.vehicleNumber,
    vendor: v.vendor,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ad-hoc Transport</h1>
        <p className="text-sm text-muted-foreground">
          All same-day requests, as submitted -- assign a vehicle or send the
          employee a note if transport cannot be provided.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ad-hoc requests yet.</p>
      ) : (
        <AdHocList requests={requests} options={options} />
      )}
    </div>
  );
}