import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const apply = process.argv.includes("--apply");

  // 1. Legacy duplicate: employee@example.com week Aug02 18Z (Dhaka-midnight
  //    key for the same Dhaka week as the canonical Aug03 00Z row).
  const legacy = await prisma.weeklySchedule.findUnique({
    where: { id: "cms6hp7nx000ep4p7nwcsr8az" },
    include: { days: { include: { routeAssignment: { select: { id: true } }, tripAssignments: { select: { id: true } } } } },
  });
  console.log("LEGACY schedule:", legacy?.weekStartDate.toISOString(), "days=", legacy?.days.length);
  for (const d of legacy?.days ?? []) {
    console.log(
      `  dow=${d.dayOfWeek} date=${d.date.toISOString()} routeAssignment=${d.routeAssignment?.id ?? "none"} trips=${d.tripAssignments.length}`
    );
  }
  const canonical = await prisma.weeklySchedule.findUnique({
    where: { id: "cms63c7ml000304labaajow8x" },
    select: { weekStartDate: true },
  });
  console.log("CANONICAL schedule:", canonical?.weekStartDate.toISOString());

  // 2. Off-midnight adhoc dates (all 18:00Z == Dhaka midnight).
  const adhoc: { id: string; date: Date }[] = await prisma.$queryRaw`
    SELECT id, date FROM "AdHocRequest"
    WHERE EXTRACT(HOUR FROM "date") <> 0 OR EXTRACT(MINUTE FROM "date") <> 0
    ORDER BY date`;
  console.log("ADHOC off-midnight rows:", adhoc.length);
  for (const a of adhoc) {
    const fixed = new Date(a.date.getTime() + 6 * 60 * 60 * 1000);
    console.log(`  ${a.id} ${a.date.toISOString()} -> ${fixed.toISOString()}`);
  }

  if (!apply) {
    console.log("\nPreview only. Re-run with --apply to commit.");
    await prisma.$disconnect();
    return;
  }

  // Delete legacy duplicate (days first — no onDelete cascade on the parent).
  if (legacy) {
    const refs = (legacy.days ?? []).filter(
      (d) => d.routeAssignment || d.tripAssignments.length > 0
    );
    if (refs.length > 0) throw new Error(`Legacy days have assignments — aborting: ${refs.map((d) => d.id)}`);
    await prisma.weeklyScheduleDay.deleteMany({ where: { weeklyScheduleId: legacy.id } });
    await prisma.weeklySchedule.delete({ where: { id: legacy.id } });
    console.log("Deleted legacy duplicate schedule + days.");
  }
  // Shift adhoc Dhaka-midnight instants to canonical UTC midnight (same Dhaka date).
  for (const a of adhoc) {
    await prisma.adHocRequest.update({
      where: { id: a.id },
      data: { date: new Date(a.date.getTime() + 6 * 60 * 60 * 1000) },
    });
  }
  console.log(`Shifted ${adhoc.length} adhoc date(s) to UTC midnight.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
