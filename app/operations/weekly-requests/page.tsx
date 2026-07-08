import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate, getWeekDays } from "@/lib/date/week";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";
import {
  WeeklyRequestsTable,
  type WeeklyRequestRow,
} from "@/components/operations/weekly-requests-table";
import {
  WeeklyRequestsFilters,
  type WeekOption,
} from "@/components/operations/weekly-requests-filters";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export default async function WeeklyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; week?: string }>;
}) {
  await requireRole([Role.OPERATIONS]);

  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const weekFilter = params.week;

  const distinctWeeks = await prisma.weeklySchedule.findMany({
    select: { weekStartDate: true },
    distinct: ["weekStartDate"],
    orderBy: { weekStartDate: "desc" },
  });

  const weekOptions: WeekOption[] = distinctWeeks.map(({ weekStartDate }) => {
    const days = getWeekDays(weekStartDate);
    return {
      value: weekStartDate.toISOString(),
      label: `${formatShortDate(days[0])} – ${formatShortDate(days[4])}`,
    };
  });

  const schedules = await prisma.weeklySchedule.findMany({
    where: weekFilter ? { weekStartDate: new Date(weekFilter) } : undefined,
    include: { employee: true, days: true },
    orderBy: { submittedAt: "desc" },
    take: MAX_UNFILTERED_ROWS,
  });

  const filteredSchedules = q
    ? schedules.filter(
        (s) =>
          s.employee.fullName.toLowerCase().includes(q) ||
          s.employee.email.toLowerCase().includes(q)
      )
    : schedules;

  const rows: WeeklyRequestRow[] = filteredSchedules.map((schedule) => {
    const days = Array.from({ length: 5 }, (_, i) => {
      const day = schedule.days.find((d) => d.dayOfWeek === i + 1);
      const value =
        day && day.needsTransport && day.arrivalTime ? day.arrivalTime : NO_TRANSPORT_VALUE;
      const display =
        value === NO_TRANSPORT_VALUE ? "Not Required" : ARRIVAL_TIME_LABELS[value] ?? value;
      return { dayOfWeek: i + 1, display, value };
    });

    return {
      id: schedule.id,
      status: schedule.status,
      rejectReason: schedule.rejectReason,
      weekLabel: formatShortDate(schedule.weekStartDate),
      employee: {
        fullName: schedule.employee.fullName,
        employeeCode: schedule.employee.employeeCode,
        email: schedule.employee.email,
        contactNumber: schedule.employee.contactNumber,
        address: schedule.employee.address,
      },
      days,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Weekly Requests</h1>
        <p className="text-sm text-muted-foreground">
          Review, edit, and approve employee weekly transport schedules.
          Approved schedules become available to Facilities for route
          planning.
        </p>
      </div>
      <WeeklyRequestsFilters weekOptions={weekOptions} />
      <WeeklyRequestsTable rows={rows} />
    </div>
  );
}
