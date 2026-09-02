import { Car, Map, Zap } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import {
  Role,
  ROLE_LABELS,
  WeeklyScheduleStatus,
  AdHocStatus,
} from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  getSubmissionWindow,
  formatShortDate,
  getWeekDays,
} from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { DashboardHero } from "@/components/shared/dashboard-hero";
import { AttentionBoard } from "@/components/shared/attention-board";

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

  const settings = await getTransportSettings();
  const window = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  const windowDays = getWeekDays(window.weekStartDate);

  return (
    <div className="space-y-7">
      <DashboardHero
        eyebrow={`${ROLE_LABELS[Role.FACILITIES]} · ${new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}`}
        title={
          <>
            Welcome back, {firstName}.
          </>
        }
        subline="Approved schedules still need routes, and vehicles must be placed."
      />

      <AttentionBoard
        subline={`Fleet ready: ${activeVehicles} active vehicles. Orders for the week of ${formatShortDate(
          windowDays[0]
        )} – ${formatShortDate(windowDays[4])}.`}
        accent="text-[#70bccc]"
        items={[
          {
            value: unassignedDays,
            label: "Approved days without a route",
            action: "Plan routes",
            href: "/facilities/route-planning",
            icon: Map,
            urgent: unassignedDays > 0,
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
  );
}
