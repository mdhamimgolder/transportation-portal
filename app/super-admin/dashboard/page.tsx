import { BarChart3, ShieldCheck, UserRound, Users } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { DashboardHero } from "@/components/shared/dashboard-hero";
import { WeatherWidget } from "@/components/shared/weather-widget";
import { AttentionBoard } from "@/components/shared/attention-board";
import { MiniStat } from "@/components/shared/mini-stat";

export default async function SuperAdminDashboardPage() {
  const user = await requireRole([Role.SUPER_ADMIN]);

  const [
    totalUsers,
    employees,
    corporate,
    operations,
    facilities,
    supers,
    assignmentsCount,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, role: Role.EMPLOYEE } }),
    prisma.user.count({
      where: { isActive: true, role: Role.CORPORATE_EMPLOYEE },
    }),
    prisma.user.count({ where: { isActive: true, role: Role.OPERATIONS } }),
    prisma.user.count({ where: { isActive: true, role: Role.FACILITIES } }),
    prisma.user.count({ where: { isActive: true, role: Role.SUPER_ADMIN } }),
    prisma.routeAssignment.count(),
  ]);

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="space-y-7">
      {/* Hero + board share the left column; the weather glass spans both
          rows at top right, its top edge aligned with the welcome line —
          so neither the hero nor the board goes full width. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
        <DashboardHero
          eyebrow={`${ROLE_LABELS[Role.SUPER_ADMIN]} · ${new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}`}
          title={<>System overview, {firstName}.</>}
          subline="Accounts, roles, and transport volumes across the whole portal."
        />
        <WeatherWidget className="sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-start" />
        <AttentionBoard
          className="min-w-0"
          subline="Every role counts only active users. Assignments are all-time driver placements."
          accent="text-[#70bccc]"
          items={[
            {
              value: totalUsers,
              label: "Active accounts across all roles",
              action: "Manage users",
              href: "/super-admin/users",
              icon: Users,
              urgent: totalUsers > 0,
            },
            {
              value: employees + corporate,
              label: "Employee riders (MDS + corporate)",
              action: "View users",
              href: "/super-admin/users",
              icon: UserRound,
            },
            {
              value: assignmentsCount,
              label: "Transport assignments delivered",
              action: "Open reports",
              href: "/super-admin/reports",
              icon: BarChart3,
            },
          ]}
        />
      </div>

      {/* Role roster — a classified breakdown of the account base */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Role roster
          </h2>
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="size-3.5" /> active only
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniStat label="Super admin" value={supers} />
          <MiniStat label="Operations" value={operations} />
          <MiniStat label="Facilities" value={facilities} />
          <MiniStat label="MDS employees" value={employees} />
          <MiniStat label="Corporate" value={corporate} />
        </div>
      </div>
    </div>
  );
}
