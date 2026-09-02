import { ClipboardCheck, UserCheck, Zap } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import {
  Role,
  WeeklyScheduleStatus,
  AdHocStatus,
  AddressChangeStatus,
  ContactChangeStatus,
  PickupPointChangeStatus,
  ROLE_LABELS,
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
  const profilePending = pendingAddress + pendingContact + pendingPickup;

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
        eyebrow={`${ROLE_LABELS[Role.OPERATIONS]} · ${new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}`}
        title={
          <>
            Welcome back, {firstName}.
          </>
        }
        subline="Submissions and profile changes land here for your review."
      />

      <AttentionBoard
        subline={`Open submission window: week of ${formatShortDate(windowDays[0])} – ${formatShortDate(windowDays[4])}. ${
          window.isOpen ? "Locking Saturday 12:00 PM." : "Window closed."
        }`}
        accent="text-[#70bccc]"
        items={[
          {
            value: pendingWeekly,
            label: "Weekly schedules to review",
            action: "Review",
            href: "/operations/weekly-requests",
            icon: ClipboardCheck,
            urgent: pendingWeekly > 0,
          },
          {
            value: profilePending,
            label: "Profile changes to approve",
            action: "Approve",
            href: "/operations/profile-approvals",
            icon: UserCheck,
            urgent: profilePending > 0,
          },
          {
            value: activeAdhoc,
            label: "Ad-hoc transport requests",
            action: "Review",
            href: "/operations/adhoc",
            icon: Zap,
            urgent: activeAdhoc > 0,
          },
        ]}
      />
    </div>
  );
}
