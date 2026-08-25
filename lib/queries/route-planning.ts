import "server-only";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { WeeklyScheduleStatus } from "@/lib/constants/enums";

export type DaySheetRow = {
  weeklyScheduleDayId: string;
  employeeName: string;
  employeeCode: string | null;
  address: string | null;
  pickupPoint: string | null;
  requestedArrivalLabel: string | null;
  pickupTime: string;
  vehicleNumber: string;
};

export type DaySheetData = {
  weekLabel: string | null;
  rows: DaySheetRow[];
};

/**
 * The day-first "sheet" Facilities plans from: every employee needing
 * transport on `dayOfWeek`, for the most recently approved week. Read-only
 * profile fields come straight from the employee record; pickupTime/
 * vehicleNumber reflect any assignment already saved.
 */
export async function getDaySheet(
  dayOfWeek: number,
  arrivalTimeLabels: Record<string, string>
): Promise<DaySheetData> {
  const latest = await prisma.weeklySchedule.findFirst({
    where: { status: WeeklyScheduleStatus.APPROVED },
    orderBy: { weekStartDate: "desc" },
    select: { weekStartDate: true },
  });

  if (!latest) {
    return { weekLabel: null, rows: [] };
  }

  const days = await prisma.weeklyScheduleDay.findMany({
    where: {
      dayOfWeek,
      needsTransport: true,
      weeklySchedule: {
        status: WeeklyScheduleStatus.APPROVED,
        weekStartDate: latest.weekStartDate,
      },
    },
    include: {
      weeklySchedule: { include: { employee: true } },
      routeAssignment: { include: { vehicleDriver: true } },
    },
  });

  days.sort((a, b) =>
    a.weeklySchedule.employee.fullName.localeCompare(b.weeklySchedule.employee.fullName)
  );

  const rows: DaySheetRow[] = days.map((d) => ({
    weeklyScheduleDayId: d.id,
    employeeName: d.weeklySchedule.employee.fullName,
    employeeCode: d.weeklySchedule.employee.employeeCode,
    address: d.weeklySchedule.employee.address,
    pickupPoint: d.weeklySchedule.employee.pickupPoint,
    requestedArrivalLabel: d.arrivalTime
      ? arrivalTimeLabels[d.arrivalTime] ?? d.arrivalTime
      : null,
    pickupTime: d.routeAssignment?.pickupTime ?? "",
    vehicleNumber: d.routeAssignment?.vehicleDriver.vehicleNumber ?? "",
  }));

  return {
    weekLabel: `Week of ${formatShortDate(latest.weekStartDate)}`,
    rows,
  };
}
