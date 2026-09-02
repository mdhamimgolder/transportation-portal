import { requireRole } from "@/lib/rbac/guards";
import { Role, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { AdHocList } from "@/components/facilities/adhoc-list";

export default async function FacilitiesAdHocPage() {
  await requireRole([Role.FACILITIES]);

  // Visible as soon as an employee submits -- only assigned (or cancelled)
  // requests drop off, since those have already moved to Allocation History.
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
    }),
    prisma.vehicleDriver.findMany({
      where: { isActive: true },
      orderBy: { driverName: "asc" },
    }),
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
          All same-day requests, as submitted -- assign a vehicle right away.
          Assigned requests move to Allocation History.
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