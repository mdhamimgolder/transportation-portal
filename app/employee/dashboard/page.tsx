import Link from "next/link";
import { CalendarDays, ClipboardList, MapPin } from "lucide-react";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { getSubmissionWindow, startOfToday } from "@/lib/date/week";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";

export default async function EmployeeDashboardPage() {
  const user = await requireRole([Role.EMPLOYEE]);

  const window = getSubmissionWindow();
  const today = startOfToday();

  const [currentSchedule, upcomingPickups, pendingAddress, pendingContact, pendingPickupPoint] =
    await Promise.all([
      prisma.weeklySchedule.findUnique({
        where: {
          employeeId_weekStartDate: {
            employeeId: user.id,
            weekStartDate: window.weekStartDate,
          },
        },
        select: { status: true },
      }),
      prisma.routeAssignment.count({
        where: {
          OR: [
            {
              weeklyScheduleDay: {
                date: { gte: today },
                weeklySchedule: { employeeId: user.id },
              },
            },
            { adHocRequest: { employeeId: user.id, date: { gte: today } } },
          ],
        },
      }),
      prisma.addressChangeRequest.count({
        where: { employeeId: user.id, status: "PENDING" },
      }),
      prisma.contactChangeRequest.count({
        where: { employeeId: user.id, status: "PENDING" },
      }),
      prisma.pickupPointChangeRequest.count({
        where: { employeeId: user.id, status: "PENDING" },
      }),
    ]);

  const firstName = user.fullName.split(" ")[0];
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={todayLabel}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="This week's schedule"
          value={currentSchedule ? currentSchedule.status.toLowerCase() : "Not submitted"}
          hint={window.isOpen ? "Submissions open" : "Window closed"}
          icon={<CalendarDays className="size-5" />}
          href="/employee/weekly"
        />
        <StatCard
          label="Upcoming pickups"
          value={upcomingPickups}
          hint="Assigned transport from today"
          icon={<MapPin className="size-5" />}
        />
        <StatCard
          label="Pending profile requests"
          value={pendingAddress + pendingContact + pendingPickupPoint}
          hint="Awaiting Operations review"
          icon={<ClipboardList className="size-5" />}
          href="/employee/profile"
        />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium">Quick actions</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/employee/weekly">Submit weekly schedule</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/employee/adhoc">Request ad-hoc transport</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
