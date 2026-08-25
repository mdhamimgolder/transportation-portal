import { Car, Map, Zap } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import { Role, WeeklyScheduleStatus, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";

export default async function FacilitiesDashboardPage() {
  const user = await requireRole([Role.FACILITIES]);

  const [unassignedDays, pendingAdhoc, activeVehicles] = await Promise.all([
    prisma.weeklyScheduleDay.count({
      where: {
        needsTransport: true,
        weeklySchedule: { status: WeeklyScheduleStatus.APPROVED },
        routeAssignment: null,
      },
    }),
    prisma.adHocRequest.count({ where: { status: AdHocStatus.APPROVED } }),
    prisma.vehicleDriver.count({ where: { isActive: true } }),
  ]);

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Route planning and vehicle assignments at a glance."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Days awaiting assignment"
          value={unassignedDays}
          hint="Approved schedules without a route"
          icon={<Map className="size-5" />}
          href="/facilities/route-planning"
        />
        <StatCard
          label="Urgent ad-hoc requests"
          value={pendingAdhoc}
          hint="Approved, awaiting vehicle assignment"
          icon={<Zap className="size-5" />}
          href="/facilities/adhoc"
        />
        <StatCard
          label="Vehicles & drivers"
          value={activeVehicles}
          hint="Active in the master list"
          icon={<Car className="size-5" />}
          href="/facilities/vehicles"
        />
      </div>
    </div>
  );
}
