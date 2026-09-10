import "server-only";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { WeeklyScheduleStatus } from "@/lib/constants/enums";

/**
 * Sort key for arrival times in the canonical plan order (10 PM -> 11 PM ->
 * midnight -> ... -> 6 AM), mirroring ARRIVAL_TIME_OPTIONS. Rows with no
 * arrival time sort last (recorded but unscheduled).
 */
function arrivalSortIndex(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const hour = Number(value.slice(0, 2));
  if (Number.isNaN(hour)) return Number.MAX_SAFE_INTEGER;
  if (hour >= 22) return hour - 22;
  return hour + 2;
}

function sortByArrival(a: string | null, b: string | null): number {
  return arrivalSortIndex(a) - arrivalSortIndex(b);
}

/** Public comparator to order records by arrival time (10 PM first, then
 *  11 PM, ... 6 AM). Returns a value usable by Array.prototype.sort. */
export function compareArrivalTimes(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  return arrivalSortIndex(a ?? null) - arrivalSortIndex(b ?? null);
}

export type DaySheetEmailStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED_DEV"
  | "NOT_SENT";

export type DaySheetRow = {
  weeklyScheduleDayId: string;
  employeeName: string;
  employeeCode: string | null;
  address: string | null;
  pickupPoint: string | null;
  requestedArrivalLabel: string | null;
  pickupTime: string;
  vehicleNumber: string;
  emailStatus: DaySheetEmailStatus | null;
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
export type ScheduleSheetRow = {
  weeklyScheduleDayId: string;
  employeeName: string;
  employeeCode: string | null;
  address: string | null;
  pickupPoint: string | null;
  requestedArrivalLabel: string | null;
  pickupTime: string;
  emailStatus: DaySheetEmailStatus | null;
};

export type ScheduleSheetVehicle = {
  vehicleDriverId: string;
  vehicleNumber: string;
  driverName: string;
  contactNumber: string;
  rows: ScheduleSheetRow[];
};

export type ScheduleSheetData = {
  weekLabel: string | null;
  /** One card per active vehicle (empty cards are drag-drop targets too). */
  vehicles: ScheduleSheetVehicle[];
  unassigned: ScheduleSheetRow[];
};

/**
 * The same day-first planning data as `getDaySheet`, grouped under vehicle
 * cards for the drag-and-drop route sheet: every employee row sits in its
 * vehicle's list (or the unassigned list), ordered by pick-up time.
 */
export async function getScheduleSheet(
  dayOfWeek: number,
  arrivalTimeLabels: Record<string, string>
): Promise<ScheduleSheetData> {
  const latest = await prisma.weeklySchedule.findFirst({
    where: { status: WeeklyScheduleStatus.APPROVED },
    orderBy: { weekStartDate: "desc" },
    select: { weekStartDate: true },
  });
  if (!latest) {
    return { weekLabel: null, vehicles: [], unassigned: [] };
  }

  const [vehicles, days] = await Promise.all([
    prisma.vehicleDriver.findMany({
      where: { isActive: true },
      orderBy: { vehicleNumber: "asc" },
    }),
    prisma.weeklyScheduleDay.findMany({
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
        routeAssignment: {
          include: {
            vehicleDriver: true,
            emailLogs: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    }),
  ]);

  const byVehicle = new Map<string, ScheduleSheetRow[]>();
  for (const v of vehicles) byVehicle.set(v.id, []);
  const unassigned: ScheduleSheetRow[] = [];

  const toRow = (d: (typeof days)[number]): ScheduleSheetRow => {
    const log = d.routeAssignment?.emailLogs[0];
    let emailStatus: DaySheetEmailStatus | null = null;
    if (d.routeAssignment) {
      emailStatus = log
        ? (log.status as DaySheetEmailStatus)
        : d.routeAssignment.emailSentAt
          ? "SENT"
          : "NOT_SENT";
    }
    return {
      weeklyScheduleDayId: d.id,
      employeeName: d.weeklySchedule.employee.fullName,
      employeeCode: d.weeklySchedule.employee.employeeCode,
      address: d.weeklySchedule.employee.address,
      pickupPoint: d.weeklySchedule.employee.pickupPoint,
      requestedArrivalLabel: d.arrivalTime
        ? arrivalTimeLabels[d.arrivalTime] ?? d.arrivalTime
        : null,
      pickupTime: d.routeAssignment?.pickupTime ?? "",
      emailStatus,
    };
  };

  for (const d of days) {
    const row = toRow(d);
    const vid = d.routeAssignment?.vehicleDriverId;
    if (vid && byVehicle.has(vid)) byVehicle.get(vid)!.push(row);
    else unassigned.push(row);
  }

  const time = (r: ScheduleSheetRow) => (r.pickupTime ? r.pickupTime : "99:99");
  const byPickupTime = (a: ScheduleSheetRow, b: ScheduleSheetRow) =>
    time(a).localeCompare(time(b));

  const vehiclesOut: ScheduleSheetVehicle[] = vehicles.map((v) => ({
    vehicleDriverId: v.id,
    vehicleNumber: v.vehicleNumber,
    driverName: v.driverName,
    contactNumber: v.contactNumber,
    rows: (byVehicle.get(v.id) ?? []).sort(byPickupTime),
  }));

  return {
    weekLabel: `Week of ${formatShortDate(latest.weekStartDate)}`,
    vehicles: vehiclesOut,
    unassigned: unassigned.sort(byPickupTime),
  };
}

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
      routeAssignment: {
        include: {
          vehicleDriver: true,
          emailLogs: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  days.sort((a, b) => sortByArrival(a.arrivalTime, b.arrivalTime));

  const rows: DaySheetRow[] = days.map((d) => {
    const log = d.routeAssignment?.emailLogs[0];
    let emailStatus: DaySheetEmailStatus | null = null;
    if (d.routeAssignment) {
      emailStatus = log
        ? (log.status as DaySheetEmailStatus)
        : d.routeAssignment.emailSentAt
          ? "SENT"
          : "NOT_SENT";
    }

    return {
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
      emailStatus,
    };
  });

  return {
    weekLabel: `Week of ${formatShortDate(latest.weekStartDate)}`,
    rows,
  };
}
