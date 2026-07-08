import { requireRole } from "@/lib/rbac/guards";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/date/week";
import { ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { getDaySheet } from "@/lib/queries/route-planning";
import { ScheduleCard, type ScheduleCardDay } from "@/components/facilities/schedule-card";
import { RoutePlanningControls } from "@/components/facilities/route-planning-controls";
import { RouteDaySheet } from "@/components/facilities/route-day-sheet";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export default async function RoutePlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; day?: string }>;
}) {
  await requireRole([Role.FACILITIES]);

  const params = await searchParams;
  const view = params.view === "day" ? "day" : "employee";
  const dayOfWeek = Number(params.day) >= 1 && Number(params.day) <= 5 ? Number(params.day) : 1;

  const vehicleDrivers = await prisma.vehicleDriver.findMany({
    where: { isActive: true },
    orderBy: { driverName: "asc" },
  });

  if (view === "day") {
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
          <h1 className="text-xl font-semibold">Route Planning</h1>
          <p className="text-sm text-muted-foreground">
            {sheet.weekLabel ?? "No approved weekly schedules yet."} — fill in
            Pick-up Time and Vehicle No for each employee; driver details fill
            in automatically.
          </p>
        </div>
        <RoutePlanningControls view={view} day={String(dayOfWeek)} />
        <RouteDaySheet key={dayOfWeek} rows={sheet.rows} vehicleLookup={vehicleLookup} />
      </div>
    );
  }

  const schedules = await prisma.weeklySchedule.findMany({
    where: { status: WeeklyScheduleStatus.APPROVED },
    include: {
      employee: true,
      days: { include: { routeAssignment: { include: { vehicleDriver: true } } } },
    },
    orderBy: [{ weekStartDate: "desc" }, { employee: { fullName: "asc" } }],
  });

  const options = vehicleDrivers.map((v) => ({
    id: v.id,
    driverName: v.driverName,
    vehicleNumber: v.vehicleNumber,
    vendor: v.vendor,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Route Planning</h1>
        <p className="text-sm text-muted-foreground">
          Operations-approved weekly schedules. Assign a vehicle & driver and
          pickup time for each day -- the employee is emailed automatically.
        </p>
      </div>
      <RoutePlanningControls view={view} day={String(dayOfWeek)} />

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No approved weekly schedules yet.
        </p>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => {
            const days: ScheduleCardDay[] = schedule.days
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((day) => ({
                id: day.id,
                dayOfWeek: day.dayOfWeek,
                date: day.date.toISOString(),
                needsTransport: day.needsTransport,
                arrivalTimeLabel: day.arrivalTime
                  ? ARRIVAL_TIME_LABELS[day.arrivalTime] ?? day.arrivalTime
                  : null,
                assignment: day.routeAssignment
                  ? {
                      vehicleDriverId: day.routeAssignment.vehicleDriverId,
                      driverName: day.routeAssignment.vehicleDriver.driverName,
                      vehicleNumber: day.routeAssignment.vehicleDriver.vehicleNumber,
                      pickupTime: day.routeAssignment.pickupTime,
                    }
                  : null,
              }));

            return (
              <ScheduleCard
                key={schedule.id}
                scheduleId={schedule.id}
                employeeName={schedule.employee.fullName}
                employeeCode={schedule.employee.employeeCode}
                weekLabel={`Week of ${formatShortDate(schedule.weekStartDate)}`}
                days={days}
                options={options}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
