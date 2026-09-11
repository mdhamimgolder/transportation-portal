import { requireRole } from "@/lib/rbac/guards";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate, getWeekDays } from "@/lib/date/week";
import {
  ARRIVAL_TIME_OPTIONS,
  NO_TRANSPORT_VALUE,
} from "@/lib/constants/arrival-times";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";
import { excelSafeText } from "@/lib/csv";
import { getDaySheet, compareArrivalTimes } from "@/lib/queries/route-planning";
import { RoutePlanningControls } from "@/components/facilities/route-planning-controls";
import { RouteDaySheet } from "@/components/facilities/route-day-sheet";
import { WeekFilter, type WeekOption } from "@/components/facilities/week-filter";
import { ExportCsvButton } from "@/components/facilities/export-csv-button";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

const CSV_HEADERS = [
  "Employee Name",
  "Employee ID",
  "Contact Number",
  "Address",
  "Pick-up Point",
  "Monday Arrival",
  "Tuesday Arrival",
  "Wednesday Arrival",
  "Thursday Arrival",
  "Friday Arrival",
];

export default async function RoutePlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; week?: string }>;
}) {
  await requireRole([Role.FACILITIES]);

  const params = await searchParams;
  const dayOfWeek = Number(params.day) >= 1 && Number(params.day) <= 5 ? Number(params.day) : 1;
  const weekFilter = typeof params.week === "string" ? params.week : undefined;

  const vehicleDrivers = await prisma.vehicleDriver.findMany({
    where: { isActive: true },
    orderBy: { driverName: "asc" },
  });

  // Weekly export (top-right): week picker + CSV over approved schedules.
  const distinctWeeks = await prisma.weeklySchedule.findMany({
    where: { status: WeeklyScheduleStatus.APPROVED },
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

  const exportSchedules = await prisma.weeklySchedule.findMany({
    where: {
      status: WeeklyScheduleStatus.APPROVED,
      ...(weekFilter ? { weekStartDate: new Date(weekFilter) } : {}),
    },
    include: { employee: true, days: true },
    orderBy: [{ weekStartDate: "desc" }, { employee: { fullName: "asc" } }],
    take: MAX_UNFILTERED_ROWS,
  });

  // Ordered by arrival time (Monday's requested arrival): 10 PM first,
  // then 11 PM, ..., 6 AM -- matching the day sheet's presentation order.
  exportSchedules.sort((a, b) => {
    const mondayA = a.days.find((d) => d.dayOfWeek === 1)?.arrivalTime;
    const mondayB = b.days.find((d) => d.dayOfWeek === 1)?.arrivalTime;
    return compareArrivalTimes(mondayA, mondayB);
  });

  const csvRows = exportSchedules.map((schedule) => {
    const dayDisplays = Array.from({ length: 5 }, (_, i) => {
      const day = schedule.days.find((d) => d.dayOfWeek === i + 1);
      return day && day.needsTransport && day.arrivalTime
        ? ARRIVAL_TIME_LABELS[day.arrivalTime] ?? day.arrivalTime
        : NO_TRANSPORT_VALUE;
    });
    return [
      schedule.employee.fullName,
      schedule.employee.employeeCode ?? "—",
      excelSafeText(schedule.employee.contactNumber ?? "—"),
      schedule.employee.address ?? "—",
      schedule.employee.pickupPoint ?? "—",
      ...dayDisplays.map((d) => (d === NO_TRANSPORT_VALUE ? "Not Required" : d)),
    ];
  });

  const exportToolbar = (
    <div className="flex items-center gap-2">
      <WeekFilter weekOptions={weekOptions} />
      <ExportCsvButton
        filename="weekly-transport-export.csv"
        headers={CSV_HEADERS}
        rows={csvRows}
      />
    </div>
  );

  const sheet = await getDaySheet(dayOfWeek, ARRIVAL_TIME_LABELS);
  const vehicleLookup = Object.fromEntries(
    vehicleDrivers.map((v) => [
      v.vehicleNumber.trim().toUpperCase(),
      { driverName: v.driverName, contactNumber: v.contactNumber },
    ])
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Pick Schedule</h1>
        <p className="text-sm text-muted-foreground">
          {sheet.weekLabel ?? "No approved weekly schedules yet."} — fill in
          Pick-up Time and Vehicle No for each employee; driver details fill
          in automatically.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RoutePlanningControls day={String(dayOfWeek)} />
        {exportToolbar}
      </div>
      <RouteDaySheet key={dayOfWeek} rows={sheet.rows} vehicleLookup={vehicleLookup} />
    </div>
  );
}
