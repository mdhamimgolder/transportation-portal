import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  addUtcCalendarDays,
  formatShortDate,
  getMondayOfWeek,
  getWeekDays,
  getSubmissionWindow,
  startOfToday,
  toUtcMidnight,
  DAY_LABELS,
} from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";
import { getUserNamesByIds } from "@/lib/queries/user-names";
import {
  WeeklyRequestsTable,
  type WeeklyRequestRow,
} from "@/components/operations/weekly-requests-table";
import {
  WeeklyRequestsFilters,
  type WeekOption,
} from "@/components/operations/weekly-requests-filters";
import { ExportCsvButton } from "@/components/facilities/export-csv-button";
import { WeeklyScheduleBulkUploadDialog } from "@/components/operations/weekly-schedule-bulk-upload-dialog";
import { excelSafeText } from "@/lib/csv";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

// Extra recent Mondays offered in the bulk-upload week dropdown even when they
// have zero submissions yet (fully-cleaned test week / backfill).
const RECENT_UPLOAD_WEEKS = 12;

export default async function WeeklyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; week?: string }>;
}) {
  await requireRole([Role.OPERATIONS]);

  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const weekFilter = params.week;
  const thisMonday = toUtcMidnight(getMondayOfWeek(startOfToday()));
  const nextMonday = addUtcCalendarDays(thisMonday, 7);
  const formatWeekOptionLabel = (weekStartDate: Date) => {
    const days = getWeekDays(weekStartDate);
    const weekType =
      weekStartDate.getTime() === thisMonday.getTime()
        ? " (this week)"
        : weekStartDate.getTime() === nextMonday.getTime()
          ? " (next week)"
          : "";
    return `${formatShortDate(days[0])} – ${formatShortDate(days[4])}${weekType}`;
  };

  // Independent reads in parallel. The search filter runs in the database
  // (before `take`), so a match beyond the newest N rows is still found.
  const [distinctWeeks, filteredSchedules, employees, settings] = await Promise.all([
    prisma.weeklySchedule.groupBy({
      by: ["weekStartDate"],
      orderBy: { weekStartDate: "desc" },
    }),
    prisma.weeklySchedule.findMany({
      where: {
        ...(weekFilter ? { weekStartDate: new Date(weekFilter) } : {}),
        ...(q
          ? {
              employee: {
                OR: [
                  { fullName: { contains: q, mode: "insensitive" as const } },
                  { email: { contains: q, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      },
      include: { employee: true, days: true },
      orderBy: { submittedAt: "desc" },
      take: MAX_UNFILTERED_ROWS,
    }),
    prisma.user.findMany({
      where: { role: Role.EMPLOYEE, isActive: true },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        email: true,
        contactNumber: true,
        address: true,
      },
      orderBy: { fullName: "asc" },
    }),
    getTransportSettings(),
  ]);

  const weekOptions: WeekOption[] = distinctWeeks.map(({ weekStartDate }) => {
    return {
      value: weekStartDate.toISOString(),
      label: formatWeekOptionLabel(weekStartDate),
    };
  });

  const reviewerNames = await getUserNamesByIds(
    filteredSchedules.map((s) => s.reviewedById)
  );

  const onBehalfWindow = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  const onBehalfWeekDates = getWeekDays(onBehalfWindow.weekStartDate);
  const onBehalfWeekLabel = `${formatShortDate(onBehalfWeekDates[0])} – ${formatShortDate(onBehalfWeekDates[4])}`;
  const onBehalfDays = onBehalfWeekDates.map((date, i) => ({
    label: DAY_LABELS[i],
    dateLabel: formatShortDate(date),
  }));

  const uploadWeekOptions: WeekOption[] = (() => {
    // Rolling set of recent Mondays (newest -> oldest) so a fully-cleaned or
    // backfill week stays uploadable even when it currently has 0 submissions
    // (a wiped test week never appears in distinctWeeks). The bulk-upload
    // action normalizes to the canonical UTC-midnight Monday key, so option
    // values must match that key.
    const byValue = new Map<string, WeekOption>();
    const submissionWeekStartMs = toUtcMidnight(onBehalfWindow.weekStartDate).getTime();
    for (let i = 0; i < RECENT_UPLOAD_WEEKS; i++) {
      const start = new Date(submissionWeekStartMs - i * 7 * 24 * 60 * 60 * 1000);
      byValue.set(start.toISOString(), {
        value: start.toISOString(),
        label: formatWeekOptionLabel(start),
      });
    }
    for (const w of weekOptions) {
      byValue.set(w.value, {
        ...w,
        label: formatWeekOptionLabel(new Date(w.value)),
      });
    }
    return [...byValue.values()];
  })();

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
      reviewerName: schedule.reviewedById
        ? reviewerNames.get(schedule.reviewedById) ?? null
        : null,
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

  const exportCsvRows = rows.map((row) => [
    row.employee.email,
    row.employee.fullName,
    row.employee.employeeCode ? excelSafeText(row.employee.employeeCode) : "—",
    ...row.days.map((d) => d.display),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">MDS Weekly Schedule</h1>
          <p className="text-sm text-muted-foreground">
            Review, edit, and approve employee weekly transport schedules.
            Approved schedules become available to Facilities for route
            planning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            filename="weekly-requests-export.csv"
            headers={[
              "Employee Email",
              "Employee Name",
              "Employee ID",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
            ]}
            rows={exportCsvRows}
          />
          <WeeklyScheduleBulkUploadDialog weekOptions={uploadWeekOptions} />
        </div>
      </div>
      <WeeklyRequestsFilters weekOptions={weekOptions} />
      <WeeklyRequestsTable
        rows={rows}
        employees={employees}
        onBehalfWeekLabel={onBehalfWeekLabel}
        onBehalfDays={onBehalfDays}
      />
    </div>
  );
}
