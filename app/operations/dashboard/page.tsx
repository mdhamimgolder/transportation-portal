import { ClipboardCheck, UserCheck, Zap } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import {
  Role,
  WeeklyScheduleStatus,
  AdHocStatus,
  AddressChangeStatus,
  ContactChangeStatus,
  PickupPointChangeStatus,
} from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";

export default async function OperationsDashboardPage() {
  const user = await requireRole([Role.OPERATIONS]);

  const [pendingWeekly, activeAdhoc, pendingAddress, pendingContact, pendingPickup] =
    await Promise.all([
      prisma.weeklySchedule.count({
        where: { status: WeeklyScheduleStatus.PENDING },
      }),
      prisma.adHocRequest.count({ where: { status: AdHocStatus.PENDING } }),
      prisma.addressChangeRequest.count({
        where: { status: AddressChangeStatus.PENDING },
      }),
      prisma.contactChangeRequest.count({
        where: { status: ContactChangeStatus.PENDING },
      }),
      prisma.pickupPointChangeRequest.count({
        where: { status: PickupPointChangeStatus.PENDING },
      }),
    ]);

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's what needs your attention today."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Weekly requests to review"
          value={pendingWeekly}
          hint="Pending approval"
          icon={<ClipboardCheck className="size-5" />}
          href="/operations/weekly-requests"
        />
        <StatCard
          label="Profile approvals"
          value={pendingAddress + pendingContact + pendingPickup}
          hint="Address, contact & pick-up point"
          icon={<UserCheck className="size-5" />}
          href="/operations/profile-approvals"
        />
        <StatCard
          label="Ad-hoc requests to review"
          value={activeAdhoc}
          hint="Pending approval"
          icon={<Zap className="size-5" />}
          href="/operations/adhoc"
        />
      </div>
    </div>
  );
}
