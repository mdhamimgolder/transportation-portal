import { requireRole } from "@/lib/rbac/guards";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate, getWeekDays, DAY_LABELS } from "@/lib/date/week";
import { ARRIVAL_TIME_OPTIONS, NO_TRANSPORT_VALUE } from "@/lib/constants/arrival-times";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";
import { excelSafeText } from "@/lib/csv";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

const HEADER_CELL =
  "bg-muted/40 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export default async function WeeklyExportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole([Role.FACILITIES]);

  const { week: weekFilter } = await searchParams;

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

  const schedules = await prisma.weeklySchedule.findMany({
    where: {
      status: WeeklyScheduleStatus.APPROVED,
      ...(weekFilter ? { weekStartDate: new Date(weekFilter) } : {}),
    },
    include: { employee: true, days: true },
    orderBy: [{ weekStartDate: "desc" }, { employee: { fullName: "asc" } }],
    take: MAX_UNFILTERED_ROWS,
  });

  const rows = schedules.map((schedule) => {
    const dayDisplays = Array.from({ length: 5 }, (_, i) => {
      const day = schedule.days.find((d) => d.dayOfWeek === i + 1);
      return day && day.needsTransport && day.arrivalTime
        ? ARRIVAL_TIME_LABELS[day.arrivalTime] ?? day.arrivalTime
        : NO_TRANSPORT_VALUE;
    });

    return {
      id: schedule.id,
      weekLabel: `${formatShortDate(schedule.weekStartDate)}`,
      employeeName: schedule.employee.fullName,
      employeeCode: schedule.employee.employeeCode ?? "—",
      contactNumber: schedule.employee.contactNumber ?? "—",
      address: schedule.employee.address ?? "—",
      pickupPoint: schedule.employee.pickupPoint ?? "—",
      days: dayDisplays,
    };
  });

  const csvRows = rows.map((row) => [
    row.employeeName,
    row.employeeCode,
    excelSafeText(row.contactNumber),
    row.address,
    row.pickupPoint,
    ...row.days.map((d) => (d === NO_TRANSPORT_VALUE ? "Not Required" : d)),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">
            Weekly Export
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operation-Admin-approved weekly schedules, ready to export for
            vendors or record-keeping.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WeekFilter weekOptions={weekOptions} />
          <ExportCsvButton
            filename="weekly-transport-export.csv"
            headers={CSV_HEADERS}
            rows={csvRows}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={`sticky left-0 z-20 ${HEADER_CELL}`}>
                Employee Name
              </TableHead>
              <TableHead className={HEADER_CELL}>Employee ID</TableHead>
              <TableHead className={HEADER_CELL}>Contact Number</TableHead>
              <TableHead className={HEADER_CELL}>Address</TableHead>
              <TableHead className={HEADER_CELL}>Pick-up Point</TableHead>
              {DAY_LABELS.map((label, i) => (
                <TableHead
                  key={label}
                  className={`text-center ${i === 0 ? "border-l" : ""} ${HEADER_CELL}`}
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  No approved weekly schedules yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, rowIndex) => (
                <TableRow key={row.id} className={rowIndex % 2 === 1 ? "bg-muted/20" : ""}>
                  <TableCell className="sticky left-0 z-10 bg-card font-medium">
                    {row.employeeName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.employeeCode}
                  </TableCell>
                  <TableCell>{row.contactNumber}</TableCell>
                  <TableCell className="max-w-56 truncate">{row.address}</TableCell>
                  <TableCell>{row.pickupPoint}</TableCell>
                  {row.days.map((day, i) => (
                    <TableCell
                      key={i}
                      className={`text-center ${i === 0 ? "border-l" : ""}`}
                    >
                      {day === NO_TRANSPORT_VALUE ? (
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          Not Required
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-mono font-normal">
                          {day}
                        </Badge>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
