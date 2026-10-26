import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  addUtcCalendarDays,
  getSubmissionWindow,
  getSubmissionWindowForWeek,
  getWeekDays,
  normalizeWeekStart,
  toUtcMidnight,
  DAY_LABELS,
  formatShortDate,
} from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { CorporateWeeklyScheduleForm } from "@/components/corporate-employee/weekly-schedule-form";
import { CountdownTimer } from "@/components/shared/countdown-timer";
import { StatusBadge } from "@/components/shared/status-badge";
import { WeekSelect } from "@/components/shared/week-select";

// Open window week plus the next three upcoming weeks -- every option is
// gated by its own Saturday-midnight submission window.
const WEEK_OPTION_COUNT = 4;

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireRole([Role.CORPORATE_EMPLOYEE]);
  const { week } = await searchParams;

  const settings = await getTransportSettings();
  const now = new Date();
  const baseWindow = getSubmissionWindow(
    now,
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );

  const optionMondays = Array.from(
    { length: WEEK_OPTION_COUNT },
    (_, i) => addUtcCalendarDays(baseWindow.weekStartDate, i * 7)
  );
  const optionWindows = optionMondays.map((monday) =>
    getSubmissionWindowForWeek(
      monday,
      now,
      settings.weeklyLockDayOfWeek,
      settings.weeklyLockHour,
      settings.weeklyLockMinute
    )
  );
  const options = optionMondays.map((monday, i) => {
    const days = getWeekDays(monday);
    const label = `${formatShortDate(days[0])} – ${formatShortDate(days[4])}`;
    const window = optionWindows[i];
    const suffix = window.isOpen
      ? " (open)"
      : now.getTime() < window.opensAt.getTime()
        ? ` (opens ${formatShortDate(toUtcMidnight(window.opensAt))})`
        : " (closed)";
    return {
      value: monday.toISOString(),
      label: `${label}${suffix}`,
      disabled: !window.isOpen,
    };
  });

  let selectedMonday = baseWindow.weekStartDate;
  if (week) {
    const parsed = new Date(week);
    if (!Number.isNaN(parsed.getTime())) {
      const normalized = normalizeWeekStart(parsed);
      if (
        parsed.getTime() === normalized.getTime() &&
        optionMondays.some((m) => m.getTime() === normalized.getTime())
      ) {
        selectedMonday = normalized;
      }
    }
  }
  const selectedWindow = getSubmissionWindowForWeek(
    selectedMonday,
    now,
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  const weekStartDate = selectedMonday;
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
    return day.needsTransport && day.arrivalTime
      ? day.arrivalTime
      : NO_TRANSPORT_VALUE;
  });

  // No Operations review step for corporate schedules -- every submission is
  // saved as already approved for Facilities; only the per-week
  // Saturday-midnight window gates the form.
  const disabled = !selectedWindow.isOpen;

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

      <WeekSelect
        value={weekStartDate.toISOString()}
        options={options}
        label="Week"
      />

      {selectedWindow.isOpen ? (
        <p className="text-sm text-muted-foreground">
          Submissions lock in{" "}
          <span className="font-medium text-foreground">
            <CountdownTimer deadline={selectedWindow.deadline.toISOString()} />
          </span>{" "}
          ({selectedWindow.deadline.toLocaleDateString(undefined, { weekday: "long" })}{" "}
          {selectedWindow.deadline.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
          ).
        </p>
      ) : now.getTime() < selectedWindow.opensAt.getTime() ? (
        <p className="text-sm text-muted-foreground">
          Submissions for this week open on{" "}
          {selectedWindow.opensAt.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
          .
        </p>
      ) : (
        <p className="text-sm text-destructive">
          The submission window for this week has closed.
        </p>
      )}

      <CorporateWeeklyScheduleForm
        key={weekStartDate.toISOString()}
        weekStartDate={weekStartDate.toISOString()}
        days={days}
        initialValues={initialValues}
        disabled={disabled}
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
    </div>
  );
}
