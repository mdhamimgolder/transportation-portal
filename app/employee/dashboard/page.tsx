import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  getMondayOfWeek,
  startOfToday,
  getWeekDays,
  DAY_LABELS,
  formatShortDate,
} from "@/lib/date/week";
import {
  TodaysScheduleCard,
  type TodaysScheduleEntry,
} from "@/components/employee/todays-schedule-card";
import { ThisWeekScheduleCard } from "@/components/employee/this-week-schedule-card";
import { DashboardHero } from "@/components/shared/dashboard-hero";
import { Button } from "@/components/ui/button";
import {
  WeeklyScheduleTable,
  type ScheduleDay,
} from "@/components/employee/weekly-schedule-table";

function toWeekDays(schedule: {
  weekStartDate: Date;
  days: Array<{
    dayOfWeek: number;
    needsTransport: boolean;
    arrivalTime: string | null;
  }>;
}): ScheduleDay[] {
  const weekDates = getWeekDays(schedule.weekStartDate);
  return weekDates.map((date, i) => {
    const day = schedule.days.find((d) => d.dayOfWeek === i + 1);
    return {
      dayOfWeek: i + 1,
      label: DAY_LABELS[i],
      dateLabel: formatShortDate(date),
      needsTransport: day?.needsTransport ?? false,
      arrivalTime: day?.arrivalTime ?? null,
    };
  });
}

export default async function EmployeeDashboardPage() {
  const user = await requireRole([Role.EMPLOYEE]);

  const today = startOfToday();
  const thisWeekStartDate = getMondayOfWeek(today);

  const [currentSchedule, todaysAssignments, weekSchedule] = await Promise.all([
    prisma.weeklySchedule.findUnique({
      where: {
        employeeId_weekStartDate: {
          employeeId: user.id,
          weekStartDate: thisWeekStartDate,
        },
      },
      select: { status: true },
    }),
    prisma.routeAssignment.findMany({
      where: {
        OR: [
          {
            weeklyScheduleDay: {
              date: today,
              weeklySchedule: { employeeId: user.id },
            },
          },
          { adHocRequest: { employeeId: user.id, date: today } },
        ],
      },
      include: { vehicleDriver: true },
      orderBy: { pickupTime: "asc" },
    }),
    prisma.weeklySchedule.findUnique({
      where: {
        employeeId_weekStartDate: {
          employeeId: user.id,
          weekStartDate: thisWeekStartDate,
        },
      },
      include: { days: true },
    }),
  ]);

  const todaysScheduleEntries: TodaysScheduleEntry[] = todaysAssignments.map((a) => ({
    id: a.id,
    pickupTime: a.pickupTime,
    driverName: a.vehicleDriver.driverName,
    contactNumber: a.vehicleDriver.contactNumber,
    vehicleNumber: a.vehicleDriver.vehicleNumber,
    requestType: a.weeklyScheduleDayId ? "Weekly schedule" : "Ad-hoc request",
  }));

  const firstName = user.fullName.split(" ")[0];
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Compact day-wise summary for the "this week" glance (Mon–Fri arrival only).
  const weekDays = weekSchedule ? toWeekDays(weekSchedule) : [];

  return (
    <div className="space-y-7">
      <DashboardHero
        eyebrow={`${ROLE_LABELS[Role.EMPLOYEE]} · ${todayLabel}`}
        title={
          <>
            Welcome back, {firstName}.
          </>
        }
        subline="Your rides for today and this week, at a glance."
        actions={
          <Button
            asChild
            size="lg"
            className="rounded-full text-ink"
            style={{ background: "var(--role-accent)" }}
          >
            <Link href="/employee/adhoc">Request ad-hoc transport</Link>
          </Button>
        }
      />

      {/* Today's rides — the hero. */}
      <TodaysScheduleCard
        entries={todaysScheduleEntries}
        title="Today's rides"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ThisWeekScheduleCard
          status={currentSchedule?.status ?? null}
          hint="Set by Operation-Admin for the current week"
          className="lg:col-span-1"
        />

        {/* Day-wise arrival summary for the week */}
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              <CalendarRange className="size-3.5" style={{ color: "var(--role-accent)" }} />
              This week · arrival times
            </p>
            {currentSchedule?.status ? (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={
                  currentSchedule.status === WeeklyScheduleStatus.APPROVED
                    ? { background: "var(--green)", color: "var(--green-foreground)" }
                    : currentSchedule.status === WeeklyScheduleStatus.REJECTED
                    ? { background: "var(--red)", color: "var(--red-foreground)" }
                    : { background: "var(--amber)", color: "var(--amber-foreground)" }
                }
              >
                {currentSchedule.status === WeeklyScheduleStatus.APPROVED
                  ? "Approved"
                  : currentSchedule.status === WeeklyScheduleStatus.REJECTED
                  ? "Rejected"
                  : "Pending"}
              </span>
            ) : null}
          </div>

          {weekDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No schedule set for this week yet.
            </p>
          ) : (
            <WeeklyScheduleTable days={weekDays} compact summary />
          )}
        </div>
      </div>
    </div>
  );
}
