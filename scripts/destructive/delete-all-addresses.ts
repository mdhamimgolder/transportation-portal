/**
 * DESTRUCTIVE — deletes every Address row and nulls the user rows that point at
 * them (homeAddressId / pickupAddressId). Listed in AGENTS.md as a script that
 * must never be run casually.
 *
 * Guarded: refuses to do anything unless run with an explicit --confirm flag:
 *   npx tsx scripts/destructive/delete-all-addresses.ts --confirm
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

if (!process.argv.includes("--confirm")) {
  console.error(
    [
      "REFUSING TO RUN.",
      "",
      "This script deletes every Address row and detaches the users that",
      "reference them. If you are certain this is what you want, re-run with:",
      "",
      "  npx tsx scripts/destructive/delete-all-addresses.ts --confirm",
    ].join("\n")
  );
  process.exit(1);
}

async function main() {
  const all = await prisma.address.findMany({ select: { id: true } });
  const ids = all.map((a) => a.id);
  console.log("addresses to delete:", ids.length);

  const affectedUsers = await prisma.user.count({
    where: { OR: [{ homeAddressId: { in: ids } }, { pickupAddressId: { in: ids } }] },
  });
  console.log("users referencing these addresses:", affectedUsers);

  const homeUsers = await prisma.user.count({ where: { homeAddressId: { in: ids } } });
  const pickupUsers = await prisma.user.count({ where: { pickupAddressId: { in: ids } } });
  console.log("homeAddress refs:", homeUsers, "| pickupAddress refs:", pickupUsers);

  if (ids.length === 0) {
    console.log("nothing to delete");
    return;
  }

  await prisma.user.updateMany({
    where: { homeAddressId: { in: ids } },
    data: { homeAddressId: null },
  });
  await prisma.user.updateMany({
    where: { pickupAddressId: { in: ids } },
    data: { pickupAddressId: null },
  });

  const result = await prisma.address.deleteMany({ where: { id: { in: ids } } });
  console.log("deleted:", JSON.stringify(result));
  console.log("remaining addresses:", await prisma.address.count());
  console.log("users with null home address now:", await prisma.user.count({ where: { homeAddressId: null } }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
