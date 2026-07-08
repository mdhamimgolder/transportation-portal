import "server-only";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";

type DateRange = { from?: Date; to?: Date };

function parseDateRange(from?: string, to?: string): DateRange {
  return {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59.999`) : undefined,
  };
}

export type WeeklyReportRow = {
  id: string;
  employeeName: string;
  employeeCode: string | null;
  weekLabel: string;
  status: string;
  submittedAtLabel: string;
  daysNeedingTransport: number;
};

export async function getWeeklyReportRows(
  q?: string,
  from?: string,
  to?: string
): Promise<WeeklyReportRow[]> {
  const range = parseDateRange(from, to);

  const schedules = await prisma.weeklySchedule.findMany({
    where:
      range.from || range.to
        ? {
            weekStartDate: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : undefined,
    include: { employee: true, days: true },
    orderBy: { weekStartDate: "desc" },
    take: MAX_UNFILTERED_ROWS,
  });

  const rows: WeeklyReportRow[] = schedules.map((s) => ({
    id: s.id,
    employeeName: s.employee.fullName,
    employeeCode: s.employee.employeeCode,
    weekLabel: formatShortDate(s.weekStartDate),
    status: s.status,
    submittedAtLabel: formatShortDate(s.submittedAt),
    daysNeedingTransport: s.days.filter((d) => d.needsTransport).length,
  }));

  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (r) =>
      r.employeeName.toLowerCase().includes(needle) ||
      (r.employeeCode?.toLowerCase().includes(needle) ?? false)
  );
}

export type AdHocReportRow = {
  id: string;
  employeeName: string;
  employeeCode: string | null;
  dateLabel: string;
  arrivalTime: string;
  status: string;
  reason: string | null;
};

export async function getAdHocReportRows(
  q?: string,
  from?: string,
  to?: string
): Promise<AdHocReportRow[]> {
  const range = parseDateRange(from, to);

  const requests = await prisma.adHocRequest.findMany({
    where:
      range.from || range.to
        ? {
            date: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : undefined,
    include: { employee: true },
    orderBy: { date: "desc" },
    take: MAX_UNFILTERED_ROWS,
  });

  const rows: AdHocReportRow[] = requests.map((r) => ({
    id: r.id,
    employeeName: r.employee.fullName,
    employeeCode: r.employee.employeeCode,
    dateLabel: formatShortDate(r.date),
    arrivalTime: r.arrivalTime,
    status: r.status,
    reason: r.reason,
  }));

  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (r) =>
      r.employeeName.toLowerCase().includes(needle) ||
      (r.employeeCode?.toLowerCase().includes(needle) ?? false)
  );
}

export type AssignmentReportRow = {
  id: string;
  employeeName: string;
  employeeCode: string | null;
  address: string | null;
  contactNumber: string | null;
  dateLabel: string;
  pickupTime: string;
  driverName: string;
  driverContactNumber: string;
};

/** Employee + assigned driver detail, across both weekly and ad-hoc pickups. */
export async function getAssignmentReportRows(
  q?: string,
  from?: string,
  to?: string
): Promise<AssignmentReportRow[]> {
  const range = parseDateRange(from, to);

  const assignments = await prisma.routeAssignment.findMany({
    include: {
      vehicleDriver: true,
      weeklyScheduleDay: {
        include: { weeklySchedule: { include: { employee: true } } },
      },
      adHocRequest: { include: { employee: true } },
    },
    orderBy: { assignedAt: "desc" },
    take: MAX_UNFILTERED_ROWS,
  });

  const rows: AssignmentReportRow[] = assignments.flatMap((assignment) => {
    const employee =
      assignment.weeklyScheduleDay?.weeklySchedule.employee ??
      assignment.adHocRequest?.employee;
    if (!employee) return [];

    const date = assignment.weeklyScheduleDay?.date ?? assignment.adHocRequest?.date;
    if (!date) return [];
    if (range.from && date < range.from) return [];
    if (range.to && date > range.to) return [];

    return [
      {
        id: assignment.id,
        employeeName: employee.fullName,
        employeeCode: employee.employeeCode,
        address: employee.address,
        contactNumber: employee.contactNumber,
        dateLabel: formatShortDate(date),
        pickupTime: assignment.pickupTime,
        driverName: assignment.vehicleDriver.driverName,
        driverContactNumber: assignment.vehicleDriver.contactNumber,
      },
    ];
  });

  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (r) =>
      r.employeeName.toLowerCase().includes(needle) ||
      r.driverName.toLowerCase().includes(needle) ||
      (r.employeeCode?.toLowerCase().includes(needle) ?? false) ||
      (r.address?.toLowerCase().includes(needle) ?? false)
  );
}
