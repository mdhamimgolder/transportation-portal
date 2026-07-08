import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { getSubmissionWindow, getWeekDays, DAY_LABELS, formatShortDate } from "@/lib/date/week";
import { NO_TRANSPORT_VALUE } from "@/lib/constants/arrival-times";
import { WeeklyScheduleForm } from "@/components/employee/weekly-schedule-form";
import { CountdownTimer } from "@/components/shared/countdown-timer";
import { StatusBadge } from "@/components/shared/status-badge";

export default async function WeeklySchedulePage() {
  const session = await requireRole([Role.EMPLOYEE]);

  const window = getSubmissionWindow();
  const weekDates = getWeekDays(window.weekStartDate);

  const existing = await prisma.weeklySchedule.findUnique({
    where: {
      employeeId_weekStartDate: {
        employeeId: session.id,
        weekStartDate: window.weekStartDate,
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

  const isLockedByApproval = existing?.status === "APPROVED";
  const disabled = !window.isOpen || isLockedByApproval;

  const days = weekDates.map((date, i) => ({
    label: DAY_LABELS[i],
    dateLabel: formatShortDate(date),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Weekly Transport</h1>
          <p className="text-sm text-muted-foreground">
            Week of {formatShortDate(weekDates[0])} –{" "}
            {formatShortDate(weekDates[4])}
          </p>
        </div>
        {existing ? <StatusBadge status={existing.status} /> : null}
      </div>

      {window.isOpen ? (
        <p className="text-sm text-muted-foreground">
          Submissions lock in{" "}
          <span className="font-medium text-foreground">
            <CountdownTimer deadline={window.deadline.toISOString()} />
          </span>{" "}
          (Saturday 12:00 PM).
        </p>
      ) : (
        <p className="text-sm text-destructive">
          The submission window for this week has closed.
        </p>
      )}

      {isLockedByApproval ? (
        <p className="text-sm text-muted-foreground">
          This schedule has been approved and can no longer be changed.
        </p>
      ) : null}

      <WeeklyScheduleForm
        days={days}
        initialValues={initialValues}
        disabled={disabled}
      />
    </div>
  );
}
