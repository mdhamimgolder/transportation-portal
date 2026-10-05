import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  addUtcCalendarDays,
  getMondayOfWeek,
  getWeekDays,
  startOfToday,
  toUtcMidnight,
  DAY_LABELS,
  formatShortDate,
} from "@/lib/date/week";
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

  const thisMonday = toUtcMidnight(getMondayOfWeek(startOfToday()));
  const nextMonday = addUtcCalendarDays(thisMonday, 7);

  const schedules = await prisma.weeklySchedule.findMany({
    where: {
      employeeId: session.id,
      weekStartDate: { in: [thisMonday, nextMonday] },
    },
    include: {
      days: { include: { routeAssignment: { include: { vehicleDriver: true } } } },
    },
    orderBy: { weekStartDate: "desc" },
  });

  const currentSchedule = schedules.find(
    (schedule) => schedule.weekStartDate.getTime() === thisMonday.getTime()
  );
  const nextSchedule = schedules.find(
    (schedule) => schedule.weekStartDate.getTime() === nextMonday.getTime()
  );

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

      <section>
        {currentSchedule ? (
          <WeeklyScheduleTable
            key={currentSchedule.id}
            days={toWeekDays(currentSchedule)}
            title="This week's schedule"
            subtitle={`Week of ${formatShortDate(getWeekDays(thisMonday)[0])} – ${formatShortDate(getWeekDays(thisMonday)[4])}`}
            statusNode={<StatusBadge status={currentSchedule.status} />}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No schedule has been set for this week yet.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Next week · {formatShortDate(getWeekDays(nextMonday)[0])} – {formatShortDate(getWeekDays(nextMonday)[4])}
        </h2>
        {nextSchedule ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-sm font-medium">Next week&apos;s schedule</p>
              <StatusBadge status={nextSchedule.status} />
            </div>
            <WeeklyScheduleTable days={toWeekDays(nextSchedule)} compact />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No schedule has been set for next week yet.
          </p>
        )}
      </section>
    </div>
  );
}
