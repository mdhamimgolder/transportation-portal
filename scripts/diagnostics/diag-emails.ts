// READ-ONLY: employee email-domain audit + which employees got the Sep-7
// bulk-upload notices (i.e., who WOULD have been emailed).
import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const users = await prisma.user.findMany({
    where: { role: "EMPLOYEE", isActive: true },
    select: { email: true },
  });
  const domains: Record<string, number> = {};
  for (const u of users) {
    const d = u.email.split("@")[1] || "?";
    domains[d] = (domains[d] || 0) + 1;
  }
  console.log("Active employee email domains:");
  for (const [d, n] of Object.entries(domains).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d}: ${n}`);
  }

  // Employees whose Sep-7 schedule was uploaded (i.e., who should get mail)
  const week = new Date("2026-09-07T00:00:00.000Z");
  const schedules = await prisma.weeklySchedule.findMany({
    where: { weekStartDate: week },
    include: { employee: { select: { fullName: true, email: true } } },
  });
  console.log(`\nSep-7 schedules (email recipients on upload): ${schedules.length}`);
  const fake = schedules.filter((s) =>
    /@(example|commure|test|mailinator|yopmail)/i.test(s.employee.email)
  );
  console.log(
    `  ...of which placeholder/test-domain addresses: ${fake.length}/${schedules.length}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());