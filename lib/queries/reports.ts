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

export type AssignmentReportRow = {
  id: string;
  type: "Weekly" | "Ad-hoc";
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
        type: assignment.weeklyScheduleDay ? "Weekly" : "Ad-hoc",
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
