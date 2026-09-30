import "dotenv/config";
import { prisma } from "@/lib/prisma";

/** DIAGNOSTIC — when was each active pickup point's `baseETA` last written? */

async function main() {
  const points = await prisma.pickupPoint.findMany({
    where: { isActive: true },
    select: {
      name: true,
      sequence: true,
      baseETA: true,
      updatedAt: true,
      createdAt: true,
      vehicle: { select: { vehicleNumber: true } },
    },
    orderBy: [{ updatedAt: "asc" }],
  });
  for (const p of points) {
    console.log(
      `${p.updatedAt.toISOString()} | ${p.vehicle.vehicleNumber} #${p.sequence} ${p.name} = ${p.baseETA} (created ${p.createdAt
        .toISOString()
        .slice(0, 10)})`
    );
  }
  console.log(`\n${points.length} active points`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});