import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  getMondayOfWeek,
  getWeekDays,
  DAY_LABELS,
  formatShortDate,
  startOfToday,
} from "@/lib/date/week";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { MyScheduleForm } from "@/components/operations/my-schedule-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireRole([Role.OPERATIONS]);

  const { week } = await searchParams;
  const parsedOffset = Number(week);
  const offset = Number.isFinite(parsedOffset) ? Math.trunc(parsedOffset) : 0;

  const thisMonday = getMondayOfWeek(startOfToday());
  const weekStartDate = new Date(thisMonday.getTime() + offset * MS_PER_WEEK);
  const weekDates = getWeekDays(weekStartDate);

  const existing = await prisma.weeklySchedule.findUnique({
    where: {
      employeeId_weekStartDate: {
        employeeId: session.id,
        weekStartDate,
      },
    },
    include: { days: true },
  });

  const initialValues = Array.from({ length: 5 }, (_, i) => {
    const day = existing?.days.find((d) => d.dayOfWeek === i + 1);
    if (!day) return NO_TRANSPORT_VALUE;
    return day.needsTransport && day.arrivalTime ? day.arrivalTime : NO_TRANSPORT_VALUE;
  });

  const days = weekDates.map((date, i) => ({
    label: DAY_LABELS[i],
    dateLabel: formatShortDate(date),
  }));

  const pastSchedules = await prisma.weeklySchedule.findMany({
    where: { employeeId: session.id },
    include: { days: true },
    orderBy: { weekStartDate: "desc" },
    take: 8,
  });

  const ARRIVAL_TIME_LABELS = Object.fromEntries(
    ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">My Schedule</h1>
          <p className="text-sm text-muted-foreground">
            Week of {formatShortDate(weekDates[0])} –{" "}
            {formatShortDate(weekDates[4])}
          </p>
        </div>
        {existing ? <StatusBadge status={existing.status} /> : null}
      </div>

      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/operations/my-schedule?week=${offset - 1}`}>
            <ChevronLeft className="size-4" />
            Previous week
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/operations/my-schedule">This week</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/operations/my-schedule?week=${offset + 1}`}>
            Next week
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>

      <MyScheduleForm
        key={weekStartDate.toISOString()}
        weekStartDate={weekStartDate.toISOString()}
        days={days}
        initialValues={initialValues}
      />

      <div id="history" className="space-y-2 scroll-mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Submission History
        </h2>
        {pastSchedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No weekly schedules submitted yet.
          </p>
        ) : (
          <div className="space-y-3">
            {pastSchedules.map((schedule) => {
              const scheduleWeekDates = getWeekDays(schedule.weekStartDate);
              return (
                <div key={schedule.id} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      Week of {formatShortDate(scheduleWeekDates[0])} –{" "}
                      {formatShortDate(scheduleWeekDates[4])}
                    </p>
                    <StatusBadge status={schedule.status} />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
                    {scheduleWeekDates.map((date, i) => {
                      const day = schedule.days.find((d) => d.dayOfWeek === i + 1);
                      const arrivalLabel =
                        day && day.needsTransport && day.arrivalTime
                          ? ARRIVAL_TIME_LABELS[day.arrivalTime] ?? day.arrivalTime
                          : "Not Required";
                      return (
                        <div key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {DAY_LABELS[i]}
                          </p>
                          <p className="text-xs">{formatShortDate(date)}</p>
                          <p className="text-sm font-medium">{arrivalLabel}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
