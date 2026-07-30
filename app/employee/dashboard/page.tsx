import Link from "next/link";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { getMondayOfWeek, getSubmissionWindow, startOfToday } from "@/lib/date/week";
import { getTransportSettings } from "@/lib/queries/settings";
import {
  TodaysScheduleCard,
  type TodaysScheduleEntry,
} from "@/components/employee/todays-schedule-card";
import { ThisWeekScheduleCard } from "@/components/employee/this-week-schedule-card";
import { DeadlineBanner } from "@/components/employee/deadline-banner";
import { Button } from "@/components/ui/button";

export default async function EmployeeDashboardPage() {
  const user = await requireRole([Role.EMPLOYEE]);

  const settings = await getTransportSettings();
  const window = getSubmissionWindow(
    new Date(),
    settings.weeklyLockDayOfWeek,
    settings.weeklyLockHour,
    settings.weeklyLockMinute
  );
  const today = startOfToday();
  const thisWeekStartDate = getMondayOfWeek(today);

  const [currentSchedule, todaysAssignments] = await Promise.all([
    prisma.weeklySchedule.findUnique({
      where: {
        employeeId_weekStartDate: {
          employeeId: user.id,
          weekStartDate: thisWeekStartDate,
        },
      },
      select: { status: true },
    }),
    prisma.routeAssignment.findMany({
      where: {
        OR: [
          {
            weeklyScheduleDay: {
              date: today,
              weeklySchedule: { employeeId: user.id },
            },
          },
          { adHocRequest: { employeeId: user.id, date: today } },
        ],
      },
      include: { vehicleDriver: true },
      orderBy: { pickupTime: "asc" },
    }),
  ]);

  const todaysScheduleEntries: TodaysScheduleEntry[] = todaysAssignments.map((a) => ({
    id: a.id,
    pickupTime: a.pickupTime,
    driverName: a.vehicleDriver.driverName,
    contactNumber: a.vehicleDriver.contactNumber,
    vehicleNumber: a.vehicleDriver.vehicleNumber,
    requestType: a.weeklyScheduleDayId ? "Weekly schedule" : "Ad-hoc request",
  }));

  const weeklyEntries = todaysScheduleEntries.filter((e) => e.requestType === "Weekly schedule");
  const adhocEntries = todaysScheduleEntries.filter((e) => e.requestType === "Ad-hoc request");
  // Normally weekly and ad-hoc pickups share a single card. Only split into two
  // when an employee has both assigned for today, so each stays easy to read.
  const isDoubleAssigned = weeklyEntries.length > 0 && adhocEntries.length > 0;

  const firstName = user.fullName.split(" ")[0];
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-7">
      {/* Design 2a header: mono uppercase date eyebrow over a large display greeting,
          pill CTAs on the right. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {todayLabel}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight">
            Welcome back,
            <br />
            {firstName}.
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            asChild
            size="lg"
            className="rounded-full bg-[#aef2ff] text-[#001014] hover:bg-[#d3f8ff]"
          >
            <Link href="/employee/weekly">Submit weekly schedule</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full">
            <Link href="/employee/adhoc">Request ad-hoc transport</Link>
          </Button>
        </div>
      </div>

      {window.isOpen ? (
        <DeadlineBanner
          deadline={window.deadline.toISOString()}
          opensAt={window.opensAt.toISOString()}
        />
      ) : null}

      <div
        className={`mx-auto grid max-w-3xl grid-cols-1 gap-4 ${
          isDoubleAssigned ? "sm:grid-cols-3" : "sm:grid-cols-2"
        }`}
      >
        <ThisWeekScheduleCard
          status={currentSchedule?.status ?? null}
          hint={
            window.isOpen
              ? "Upcoming weekly schedule submission open"
              : "Upcoming weekly schedule submission closed"
          }
        />
        {isDoubleAssigned ? (
          <>
            <TodaysScheduleCard entries={weeklyEntries} title="Today's schedule" />
            <TodaysScheduleCard entries={adhocEntries} title="Today's ad-hoc" />
          </>
        ) : (
          <TodaysScheduleCard entries={todaysScheduleEntries} />
        )}
      </div>
    </div>
  );
}
