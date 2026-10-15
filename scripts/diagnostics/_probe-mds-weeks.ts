import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { getMondayOfWeek, toUtcMidnight } from "@/lib/date/week";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("TZ:", process.env.TZ, "| offset(min):", new Date().getTimezoneOffset());

  const selected = new Date("2026-10-12T00:00:00.000Z"); // bulk-upload dropdown "this week"
  console.log("dropdown value          :", selected.toISOString());
  console.log("getMondayOfWeek(x)      :", getMondayOfWeek(selected).toISOString());
  console.log("toUtcMidnight(getMon(x)):", toUtcMidnight(getMondayOfWeek(selected)).toISOString(), "  <-- stored week");
  console.log("getMondayOfWeek(toUtc(x)):", getMondayOfWeek(toUtcMidnight(selected)).toISOString(), "  <-- after fix");

  const audits = await prisma.auditLog.findMany({
    where: { createdAt: { gte: new Date("2026-10-12T00:00:00.000Z") } },
    select: { action: true, createdAt: true, actorRole: true, entityId: true, description: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log("\n--- audit log today ---");
  for (const a of audits) {
    console.log(a.createdAt.toISOString(), a.action, a.actorRole, "|", a.description?.slice(0, 90));
  }

  const plans = await prisma.routePlan.groupBy({
    by: ["weekStartDate"],
    _count: { _all: true },
    orderBy: { weekStartDate: "desc" },
    take: 6,
  });
  console.log("\n--- route plans by week ---");
  console.log(plans.map((p) => `${p.weekStartDate.toISOString()}:${p._count._all}`));

  const assignments = await prisma.routeAssignment.count({
    where: {
      OR: [
        { weeklyScheduleDay: { weeklySchedule: { weekStartDate: new Date("2026-10-05T00:00:00.000Z") } } },
        { weeklyScheduleDay: { weeklySchedule: { weekStartDate: new Date("2026-10-12T00:00:00.000Z") } } },
      ],
    },
  });
  console.log("route assignments for 10-05 / 10-12:", assignments);

  const wk = await prisma.weeklySchedule.findMany({
    where: { weekStartDate: new Date("2026-10-05T00:00:00.000Z") },
    select: { id: true, employee: { select: { email: true } }, days: { select: { id: true } } },
  });
  console.log("\nrows in 2026-10-05:", wk.map((w) => `${w.employee.email} days=${w.days.length}`));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
