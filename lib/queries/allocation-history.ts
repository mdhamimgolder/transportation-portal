import "server-only";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { MAX_UNFILTERED_ROWS } from "@/lib/constants/limits";

export type AllocationHistoryRow = {
  id: string;
  employeeName: string;
  employeeCode: string | null;
  type: "Weekly" | "Ad-hoc";
  dateLabel: string;
  driverName: string;
  driverContactNumber: string;
  vehicleNumber: string;
  vendor: string;
  pickupTime: string;
  assignedAtLabel: string;
};

export async function getAllocationHistory(q?: string): Promise<AllocationHistoryRow[]> {
  // Capped at the most recent MAX_UNFILTERED_ROWS assignments -- without this,
  // a table with years of history gets pulled into memory on every page
  // load. Trade-off: search only looks within that recent window, not the
  // entire history. Revisit with real pagination/date filters if that's a
  // problem in practice.
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

  const rows: AllocationHistoryRow[] = assignments.flatMap((assignment) => {
    const employee =
      assignment.weeklyScheduleDay?.weeklySchedule.employee ??
      assignment.adHocRequest?.employee;
    if (!employee) return [];

    const date = assignment.weeklyScheduleDay?.date ?? assignment.adHocRequest?.date;
    if (!date) return [];

    return [
      {
        id: assignment.id,
        employeeName: employee.fullName,
        employeeCode: employee.employeeCode,
        type: assignment.weeklyScheduleDay ? "Weekly" : "Ad-hoc",
        dateLabel: formatShortDate(date),
        driverName: assignment.vehicleDriver.driverName,
        driverContactNumber: assignment.vehicleDriver.contactNumber,
        vehicleNumber: assignment.vehicleDriver.vehicleNumber,
        vendor: assignment.vehicleDriver.vendor,
        pickupTime: assignment.pickupTime,
        assignedAtLabel: formatShortDate(assignment.assignedAt),
      },
    ];
  });

  if (!q) return rows;

  const needle = q.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter(
    (row) =>
      row.employeeName.toLowerCase().includes(needle) ||
      row.driverName.toLowerCase().includes(needle) ||
      row.vehicleNumber.toLowerCase().includes(needle) ||
      row.vendor.toLowerCase().includes(needle) ||
      row.driverContactNumber.toLowerCase().includes(needle) ||
      (row.employeeCode?.toLowerCase().includes(needle) ?? false)
  );
}
