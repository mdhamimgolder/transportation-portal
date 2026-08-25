import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { getWeekDays, DAY_LABELS, formatShortDate } from "@/lib/date/week";
import { ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { StatusBadge } from "@/components/shared/status-badge";

export default async function WeeklySchedulePage() {
  const session = await requireRole([Role.EMPLOYEE]);

  const schedules = await prisma.weeklySchedule.findMany({
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
      <div>
        <h1 className="text-xl font-semibold">Weekly Transport</h1>
        <p className="text-sm text-muted-foreground">
          Your weekly transport schedule, set by Operation-Admin.
        </p>
      </div>

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No weekly schedule has been set yet.
        </p>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => {
            const weekDates = getWeekDays(schedule.weekStartDate);
            return (
              <div key={schedule.id} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    Week of {formatShortDate(weekDates[0])} –{" "}
                    {formatShortDate(weekDates[4])}
                  </p>
                  <StatusBadge status={schedule.status} />
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
                  {weekDates.map((date, i) => {
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
                {schedule.status === "REJECTED" && schedule.rejectReason ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reason: {schedule.rejectReason}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
