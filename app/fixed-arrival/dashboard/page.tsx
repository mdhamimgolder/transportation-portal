import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { startOfToday, getMondayOfWeek, getWeekDays, formatShortDate } from "@/lib/date/week";
import { ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import {
  TodaysScheduleCard,
  type TodaysScheduleEntry,
} from "@/components/employee/todays-schedule-card";
import { DashboardHero } from "@/components/shared/dashboard-hero";
import { WeatherWidget } from "@/components/shared/weather-widget";
import { CalendarDays, Clock } from "lucide-react";

const ARRIVAL_TIME_LABELS = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

export default async function FixedArrivalDashboardPage() {
  const user = await requireRole([Role.FIXED_ARRIVAL]);

  const today = startOfToday();
  const thisWeekStartDate = getMondayOfWeek(today);

  // Their standing fixed arrival + this week's service dates.
  const [profile, todaysAssignments] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { fixedArrivalTime: true },
    }),
    prisma.tripAssignment.findMany({
      where: {
        employeeId: user.id,
        routePlan: { dayDate: today },
      },
      include: { vehicle: true },
      orderBy: { pickupTime: "asc" },
    }),
  ]);

  const arrivalLabel = profile.fixedArrivalTime
    ? ARRIVAL_TIME_LABELS[profile.fixedArrivalTime] ?? profile.fixedArrivalTime
    : null;

  const entries: TodaysScheduleEntry[] = todaysAssignments.map((a) => ({
    id: a.id,
    pickupTime: a.pickupTime ?? "",
    driverName: a.vehicle.driverName ?? "",
    contactNumber: a.vehicle.driverContact ?? "",
    vehicleNumber: a.vehicle.vehicleNumber,
    requestType: "Fixed arrival",
  }));

  const firstName = user.fullName.split(" ")[0];
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const weekDates = getWeekDays(thisWeekStartDate);

  return (
    <div className="space-y-7">
      {/* Hero + board share the left column; the weather glass spans both
          rows at top right, its top edge aligned with the welcome line —
          so neither the hero nor the board goes full width. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
        <DashboardHero
          eyebrow={`${ROLE_LABELS[Role.FIXED_ARRIVAL]} · ${todayLabel}`}
          title={<>Welcome back, {firstName}.</>}
          subline="Your fixed arrival time and today's ride, in one place."
        />
        <WeatherWidget className="sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-start" />
        <TodaysScheduleCard
          className="min-w-0"
          entries={entries}
          title="Today's ride"
        />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <CalendarDays className="size-3.5" style={{ color: "var(--role-accent)" }} />
            My fixed arrival
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted px-4 py-3">
          <span className="flex items-center gap-2">
            <Clock className="size-4 text-amber" />
            <span className="text-sm text-muted-foreground">Arrive at office</span>
          </span>
          <span className="inline-flex rounded-full bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-600">
            {arrivalLabel ?? "Not chosen yet"}
          </span>
          <span className="text-xs text-muted-foreground">
            {profile.fixedArrivalTime
              ? "Locked — contact Facilities to change it."
              : "Pick it once from My Schedule; it applies to every week."}
          </span>
        </div>
        {profile.fixedArrivalTime ? (
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
            {weekDates.map((date, i) => (
              <div key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {["Mon", "Tue", "Wed", "Thu", "Fri"][i]}
                </p>
                <p className="text-xs">{formatShortDate(date)}</p>
                <p className="text-sm font-medium tabular-nums">{arrivalLabel}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}