import "server-only";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";
import { getUserNamesByIds } from "@/lib/queries/user-names";

export type AllocationHistoryRow = {
  id: string;
  employeeName: string;
  employeeEmail: string;
  employeeCode: string | null;
  type: "Weekly" | "Ad-hoc";
  dateLabel: string;
  driverName: string;
  driverContactNumber: string;
  vehicleNumber: string;
  vendor: string;
  pickupTime: string;
  assignedAtLabel: string;
  assignedByName: string | null;
};

export type AllocationHistoryFilters = {
  q?: string;
  /** "weekly" | "adhoc" -- when omitted, no rows are returned (filter-first UX). */
  type?: string;
  /** "YYYY-MM-DD" -- restricts to assignments on/after this calendar date. */
  from?: string;
  /** "YYYY-MM-DD" -- restricts to assignments on/before this calendar date. */
  to?: string;
};

export async function getAllocationHistory(
  filters: AllocationHistoryFilters
): Promise<AllocationHistoryRow[]> {
  const { q, type, from, to } = filters;

  // Type must be selected first (filter-first UX) -- without it we'd be
  // pulling the whole, potentially years-long, assignment history.
  if (type !== "weekly" && type !== "adhoc") return [];

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
  const dateFilter =
    fromDate || toDate
      ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
      : undefined;

  // Capped at the most recent MAX_UNFILTERED_ROWS assignments -- without this,
  // a table with years of history gets pulled into memory on every page
  // load. Trade-off: search only looks within that recent window, not the
  // entire history. Revisit with real pagination if that's a problem in
  // practice.
  const assignments = await prisma.routeAssignment.findMany({
    where:
      type === "weekly"
        ? {
            weeklyScheduleDayId: { not: null },
            ...(dateFilter ? { weeklyScheduleDay: { date: dateFilter } } : {}),
          }
        : {
            adHocRequestId: { not: null },
            ...(dateFilter ? { adHocRequest: { date: dateFilter } } : {}),
          },
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

  const assignerNames = await getUserNamesByIds(
    assignments.map((a) => a.assignedById)
  );

  const rows: AllocationHistoryRow[] = assignments.flatMap((assignment) => {
    const employee =
      assignment.weeklyScheduleDay?.weeklySchedule.employee ??
      assignment.adHocRequest?.employee;
    if (!employee) return [];

    const assignmentDate =
      assignment.weeklyScheduleDay?.date ?? assignment.adHocRequest?.date;
    if (!assignmentDate) return [];

    return [
      {
        id: assignment.id,
        employeeName: employee.fullName,
        employeeEmail: employee.email,
        employeeCode: employee.employeeCode,
        type: assignment.weeklyScheduleDay ? "Weekly" : "Ad-hoc",
        dateLabel: formatShortDate(assignmentDate),
        driverName: assignment.vehicleDriver.driverName,
        driverContactNumber: assignment.vehicleDriver.contactNumber,
        vehicleNumber: assignment.vehicleDriver.vehicleNumber,
        vendor: assignment.vehicleDriver.vendor,
        pickupTime: assignment.pickupTime,
        assignedAtLabel: formatShortDate(assignment.assignedAt),
        assignedByName: assignerNames.get(assignment.assignedById) ?? null,
      },
    ];
  });

  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (row) =>
      row.employeeName.toLowerCase().includes(needle) ||
      row.employeeEmail.toLowerCase().includes(needle) ||
      row.driverName.toLowerCase().includes(needle) ||
      row.vehicleNumber.toLowerCase().includes(needle) ||
      row.vendor.toLowerCase().includes(needle) ||
      row.driverContactNumber.toLowerCase().includes(needle) ||
      (row.employeeCode?.toLowerCase().includes(needle) ?? false)
  );
}
