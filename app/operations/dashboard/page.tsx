import { Inbox, Flag, Zap } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import {
  Role,
  WeeklyScheduleStatus,
  AdHocStatus,
  ROLE_LABELS,
} from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  dhakaDateTimeFromMinutes,
  getSubmissionWindow,
  startOfToday,
} from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { DashboardHero } from "@/components/shared/dashboard-hero";
import { WeatherWidget } from "@/components/shared/weather-widget";
import { AttentionBoard } from "@/components/shared/attention-board";
import { SubmissionProgress } from "@/components/shared/submission-progress";

export default async function OperationsDashboardPage() {
  const user = await requireRole([Role.OPERATIONS]);

  // Dhaka-calendar month/day boundaries as UTC instants (see lib/date/week).
  const today = startOfToday();
  const firstOfThisMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  );
  const monthStartUtc = dhakaDateTimeFromMinutes(firstOfThisMonth, 0);
  const todayStartUtc = dhakaDateTimeFromMinutes(today, 0);

  const [monthSubmissions, unassignedToday, failedEmailsToday, activeAdhoc] =
    await Promise.all([
      // Every weeklySchedule row created this month, all roles included
      // (per user request: auto-generated fixed-arrival schedules count too).
      prisma.weeklySchedule.count({
        where: { submittedAt: { gte: monthStartUtc } },
      }),
      // Riders with an arrival time TODAY whose driver/vehicle was never
      // assigned. Fixed-arrival employees are planned via their standing
      // record (no RouteAssignment by design) so they are excluded.
      prisma.weeklyScheduleDay.count({
        where: {
          date: today,
          needsTransport: true,
          routeAssignment: null,
          weeklySchedule: {
            status: WeeklyScheduleStatus.APPROVED,
            employee: { role: { not: Role.FIXED_ARRIVAL } },
          },
        },
      }),
      // Transport notification emails that failed to send today.
      prisma.emailNotificationLog.count({
        where: { status: "FAILED", createdAt: { gte: todayStartUtc } },
      }),
      prisma.adHocRequest.count({ where: { status: AdHocStatus.PENDING } }),
    ]);

  const firstName = user.fullName.split(" ")[0];
  const todayFollowUps = unassignedToday + failedEmailsToday;

  const settings = await getTransportSettings();
  const window = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );

  return (
    <div className="space-y-7">
      {/* Hero + board share the left column; the weather glass spans both
          rows at top right, its top edge aligned with the welcome line —
          so neither the hero nor the board goes full width. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
        <DashboardHero
          eyebrow={`${ROLE_LABELS[Role.OPERATIONS]} · ${new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}`}
          title={<>Welcome back, {firstName}.</>}
          subline="Submissions and daily follow-ups land here."
        />
        <WeatherWidget className="sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-start" />
        <AttentionBoard
          className="min-w-0"
          subline={
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink-foreground/80 tracking-wide">
                Eyeview of Transport Report
              </p>
              <SubmissionProgress
                opensAtMs={window.opensAt.getTime()}
                deadlineMs={window.deadline.getTime()}
                weekStartDate={window.weekStartDate}
              />
            </div>
          }
          accent="text-[#70bccc]"
          items={[
            {
              value: monthSubmissions,
              label: "This Month Total Submissions For Transport",
              icon: Inbox,
              urgent: monthSubmissions > 0,
            },
            {
              value: todayFollowUps,
              label: "Today's FallBack — unassigned driver & failed to sent notification found",
              icon: Flag,
              urgent: todayFollowUps > 0,
            },
            {
              value: activeAdhoc,
              label: "Ad-hoc requests monitored",
              action: "View",
              href: "/operations/adhoc",
              icon: Zap,
              urgent: activeAdhoc > 0,
            },
          ]}
        />
      </div>
    </div>
  );
}
