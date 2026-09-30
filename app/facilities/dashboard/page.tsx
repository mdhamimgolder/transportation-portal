import { Car, MapPin, Zap } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS, AdHocStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db/retry";
import { DashboardHero } from "@/components/shared/dashboard-hero";
import { WeatherWidget } from "@/components/shared/weather-widget";
import { AttentionBoard } from "@/components/shared/attention-board";

export default async function FacilitiesDashboardPage() {
  const user = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  // Current (Dhaka) calendar month boundaries for the pick-up counter.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [monthlyPickups, pendingAdhoc, activeVehicles] = await Promise.all([
    withDbRetry("monthly pickup count", () =>
      prisma.routeAssignment.count({
        where: { assignedAt: { gte: monthStart, lt: nextMonthStart } },
      })
    ),
    withDbRetry("ad-hoc count", () =>
      prisma.adHocRequest.count({ where: { status: AdHocStatus.APPROVED } })
    ),
    withDbRetry("vehicle count", () =>
      prisma.vehicleDriver.count({ where: { isActive: true } })
    ),
  ]);

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="space-y-7">
      {/* Hero + board share the left column; the weather glass spans both
          rows at top right, its top edge aligned with the welcome line —
          so neither the hero nor the board goes full width. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
        <DashboardHero
          eyebrow={`${ROLE_LABELS[Role.FACILITIES]} · ${new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}`}
          title={<>Welcome back, {firstName}.</>}
          subline="Approved schedules still need routes, and vehicles must be placed."
        />
        <WeatherWidget className="sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-start" />
        <AttentionBoard
          className="min-w-0"
          subline="Fleet Summary"
          accent="text-[#70bccc]"
          items={[
            {
              value: monthlyPickups,
              label: "Total pick-ups (this month)",
              action: "View history",
              href: "/facilities/allocation-history",
              icon: MapPin,
            },
            {
              value: pendingAdhoc,
              label: "Ad-hoc requests awaiting placement",
              action: "Assign",
              href: "/facilities/adhoc",
              icon: Zap,
              urgent: pendingAdhoc > 0,
            },
            {
              value: activeVehicles,
              label: "Active vehicles & drivers",
              action: "Manage fleet",
              href: "/facilities/vehicles",
              icon: Car,
            },
          ]}
        />
      </div>
    </div>
  );
}
