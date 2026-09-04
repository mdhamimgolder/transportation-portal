import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  getWeekDays,
  getSubmissionWindow,
  DAY_LABELS,
  formatShortDate,
} from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { StatusBadge } from "@/components/shared/status-badge";
import { WeeklyScheduleTable, type ScheduleDay } from "@/components/employee/weekly-schedule-table";

function toWeekDays({ weekStartDate, days }: {
  weekStartDate: Date;
  days: Array<{
    dayOfWeek: number;
    needsTransport: boolean;
    arrivalTime: string | null;
    routeAssignment: {
      pickupTime: string;
      vehicleDriver: { driverName: string; vehicleNumber: string };
    } | null;
  }>;
}): ScheduleDay[] {
  const weekDates = getWeekDays(weekStartDate);
  return weekDates.map((date, i) => {
    const day = days.find((d) => d.dayOfWeek === i + 1);
    return {
      dayOfWeek: i + 1,
      label: DAY_LABELS[i],
      dateLabel: formatShortDate(date),
      needsTransport: day?.needsTransport ?? false,
      arrivalTime: day?.arrivalTime ?? null,
      assignment: day?.routeAssignment
        ? {
            driverName: day.routeAssignment.vehicleDriver.driverName,
            vehicleNumber: day.routeAssignment.vehicleDriver.vehicleNumber,
            pickupTime: day.routeAssignment.pickupTime,
          }
        : null,
    };
  });
}

export default async function WeeklySchedulePage() {
  const session = await requireRole([Role.EMPLOYEE]);

  const settings = await getTransportSettings();
  const window = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );

  // Employees see the currently-open submission week plus the one before it.
  const thisMonday = window.weekStartDate;
  const prevMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);

  const schedules = await prisma.weeklySchedule.findMany({
    where: {
      employeeId: session.id,
      weekStartDate: { in: [thisMonday, prevMonday] },
    },
    include: {
      days: { include: { routeAssignment: { include: { vehicleDriver: true } } } },
    },
    orderBy: { weekStartDate: "desc" },
  });

  const [latest, ...history] = schedules;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Your weekly transport
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your office-transport schedule, set by Operation-Admin. One row per
          day — select a day to see the full 24-hour arrival time.
        </p>
      </div>

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No weekly schedule has been set yet.
        </p>
      ) : (
        <>
          <section>
            {latest ? (
              <WeeklyScheduleTable
                key={latest.id}
                days={toWeekDays(latest)}
                title="This week's schedule"
                subtitle={`Week of ${formatShortDate(getWeekDays(latest.weekStartDate)[0])} – ${formatShortDate(getWeekDays(latest.weekStartDate)[4])}`}
                statusNode={<StatusBadge status={latest.status} />}
              />
            ) : null}
          </section>

          {history.length > 0 ? (
            <section id="history" className="scroll-mt-6 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Previous week
              </h2>
              {history.map((schedule) => (
                <div key={schedule.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <p className="text-sm font-medium">
                      Week of {formatShortDate(getWeekDays(schedule.weekStartDate)[0])} –{" "}
                      {formatShortDate(getWeekDays(schedule.weekStartDate)[4])}
                    </p>
                    <StatusBadge status={schedule.status} />
                  </div>
                  <WeeklyScheduleTable days={toWeekDays(schedule)} compact />
                  {schedule.status === "REJECTED" && schedule.rejectReason ? (
                    <p className="px-1 text-xs text-muted-foreground">
                      Reason: {schedule.rejectReason}
                    </p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
