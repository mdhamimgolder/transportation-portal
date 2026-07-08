import { ScrollText, UserRound, Users } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";

export default async function SuperAdminDashboardPage() {
  const user = await requireRole([Role.SUPER_ADMIN]);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalUsers, employees, auditLast24h] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, role: Role.EMPLOYEE } }),
    prisma.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
  ]);

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="System overview and account management."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active accounts"
          value={totalUsers}
          hint="Across all roles"
          icon={<Users className="size-5" />}
          href="/super-admin/users"
        />
        <StatCard
          label="Employees"
          value={employees}
          hint="Active employee accounts"
          icon={<UserRound className="size-5" />}
        />
        <StatCard
          label="Audit events (24h)"
          value={auditLast24h}
          hint="Logged system changes"
          icon={<ScrollText className="size-5" />}
          href="/super-admin/audit-log"
        />
      </div>
    </div>
  );
}
