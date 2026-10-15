import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { AdHocTable } from "@/components/operations/adhoc-table";

export default async function OperationsAdHocPage() {
  await requireRole([Role.OPERATIONS]);

  // Monitoring only -- requests need no Operations approval. Facilities
  // assignments (driver + pick-up time) are read here on every load, so
  // anything Facilities saves is reflected automatically.
  const requests = await prisma.adHocRequest.findMany({
    include: {
      employee: true,
      routeAssignment: { include: { vehicleDriver: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const rows = requests.map((request) => ({
    id: request.id,
    date: request.date,
    arrivalTime: request.arrivalTime,
    reason: request.reason,
    employee: {
      fullName: request.employee.fullName,
      employeeCode: request.employee.employeeCode,
      email: request.employee.email,
      contactNumber: request.employee.contactNumber,
    },
    routeAssignment: request.routeAssignment
      ? {
          pickupTime: request.routeAssignment.pickupTime,
          vehicleDriver: {
            driverName: request.routeAssignment.vehicleDriver.driverName,
            contactNumber: request.routeAssignment.vehicleDriver.contactNumber,
            vehicleNumber: request.routeAssignment.vehicleDriver.vehicleNumber,
          },
        }
      : null,
  }));

  const employees = await prisma.user.findMany({
    where: { role: Role.EMPLOYEE, isActive: true },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      email: true,
      contactNumber: true,
      address: true,
    },
    orderBy: { fullName: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Adhoc Monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Track every ad-hoc request and the driver Facilities assigned.
          Assignments made by Facilities appear here automatically.
        </p>
      </div>

      <AdHocTable requests={rows} employees={employees} />
    </div>
  );
}
