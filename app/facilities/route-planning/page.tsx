import Link from "next/link";
import { requireRole } from "@/lib/rbac/guards";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { getActiveVehicleDrivers } from "@/lib/queries/fleet";
import { formatShortDate, getWeekDays } from "@/lib/date/week";
import {
  ARRIVAL_TIME_OPTIONS,
  NO_TRANSPORT_VALUE,
} from "@/lib/constants/arrival-times";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";
import { excelSafeText } from "@/lib/csv";
import { getDaySheet, getFixedArrivalPickupList, compareArrivalTimes } from "@/lib/queries/route-planning";
import { RoutePlanningControls } from "@/components/facilities/route-planning-controls";
import { RouteDaySheet } from "@/components/facilities/route-day-sheet";
import { FixedArrivalList } from "@/components/facilities/fixed-arrival-list";
import { WeekFilter, type WeekOption } from "@/components/facilities/week-filter";
import { ExportCsvButton } from "@/components/facilities/export-csv-button";
import { Button } from "@/components/ui/button";

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
  searchParams: Promise<{ day?: string; week?: string; view?: string }>;
}) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const params = await searchParams;
  const dayOfWeek = Number(params.day) >= 1 && Number(params.day) <= 5 ? Number(params.day) : 1;
  const weekFilter = typeof params.week === "string" ? params.week : undefined;
  // ?view=fixed switches the page to the "Corporate Fixed arrival" list;
  // default view is the weekly day sheet.
  const fixedView = params.view === "fixed";

  // Every read on this page is independent — fetch them in parallel.
  // Weekly export (top-right): week picker + CSV over approved schedules.
  // `groupBy` lets Postgres return the distinct weeks instead of shipping
  // every approved schedule row to dedupe in memory.
  const [vehicleDrivers, distinctWeeks, exportSchedules, sheet, fixedList] = await Promise.all([
    getActiveVehicleDrivers(),
    prisma.weeklySchedule.groupBy({
      by: ["weekStartDate"],
      where: { status: WeeklyScheduleStatus.APPROVED },
      orderBy: { weekStartDate: "desc" },
    }),
    prisma.weeklySchedule.findMany({
      where: {
        status: WeeklyScheduleStatus.APPROVED,
        // FIXED_ARRIVAL employees are planned in the "Corporate Fixed
        // arrival" list instead, so keep them out of the weekly export.
        employee: { role: { not: Role.FIXED_ARRIVAL } },
        ...(weekFilter ? { weekStartDate: new Date(weekFilter) } : {}),
      },
      select: {
        employee: {
          select: {
            fullName: true,
            employeeCode: true,
            contactNumber: true,
            address: true,
            pickupPoint: true,
          },
        },
        days: { select: { dayOfWeek: true, needsTransport: true, arrivalTime: true } },
      },
      orderBy: [{ weekStartDate: "desc" }, { employee: { fullName: "asc" } }],
      take: MAX_UNFILTERED_ROWS,
    }),
    fixedView
      ? Promise.resolve(null)
      : getDaySheet(dayOfWeek, ARRIVAL_TIME_LABELS),
    fixedView
      ? getFixedArrivalPickupList(ARRIVAL_TIME_LABELS)
      : Promise.resolve(null),
  ]);

  const weekOptions: WeekOption[] = distinctWeeks.map(({ weekStartDate }) => {
    const days = getWeekDays(weekStartDate);
    return {
      value: weekStartDate.toISOString(),
      label: `${formatShortDate(days[0])} – ${formatShortDate(days[4])}`,
    };
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

  const vehicleLookup = Object.fromEntries(
    vehicleDrivers.map((v) => [
      v.vehicleNumber.trim().toUpperCase(),
      { driverName: v.driverName, contactNumber: v.contactNumber },
    ])
  );

  const switchViewHref = (target: "sheet" | "fixed") => {
    const p = new URLSearchParams();
    p.set("day", String(dayOfWeek));
    if (weekFilter) p.set("week", weekFilter);
    if (target === "fixed") p.set("view", "fixed");
    return `/facilities/route-planning?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Pick Schedule</h1>
        <p className="text-sm text-muted-foreground">
          {fixedView
            ? "Corporate Fixed arrival — standing pick-up details for fixed-arrival employees; saved details persist every week until changed."
            : `${sheet?.weekLabel ?? "No approved weekly schedules yet."} — fill in Pick-up Time and Vehicle No for each employee; driver details fill in automatically.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {fixedView ? null : <RoutePlanningControls day={String(dayOfWeek)} />}
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            title={
              fixedView
                ? "Viewing the Corporate Fixed arrival list — click to return to the day sheet"
                : "Open the Corporate Fixed arrival list"
            }
          >
            <Link href={switchViewHref(fixedView ? "sheet" : "fixed")}>
              {fixedView ? "✓ Corporate Fixed arrival" : "Corporate Fixed arrival"}
            </Link>
          </Button>
          {fixedView ? null : exportToolbar}
        </div>
      </div>
      {fixedView ? (
        <FixedArrivalList
          key={fixedList ? "fixed" : "empty"}
          rows={fixedList?.rows ?? []}
          vehicleLookup={vehicleLookup}
        />
      ) : (
        <RouteDaySheet key={dayOfWeek} rows={sheet?.rows ?? []} vehicleLookup={vehicleLookup} />
      )}
    </div>
  );
}
