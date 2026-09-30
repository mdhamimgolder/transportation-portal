/**
 * ⚠️  DO-NOT-RUN (AGENTS.md): "Never run the destructive scripts
 * _delete-all-addresses.ts / _check-homes.ts".
 *
 * Current revision is READ-ONLY — it only prints home-address coordinates for a
 * fixed list of employees — but it is kept behind the same caution because an
 * earlier revision wrote data. Only run it when a task explicitly asks for it.
 *
 *   npx tsx scripts/destructive/check-homes.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const names = [
    "Shamim Hasan",
    "Tazruna Nowshin Sultana",
    "Yusra Monem",
    "Md. Zuhayer Islam",
    "Sathirtha Dewan",
    "Khandker Nibir Mahmud",
    "Md. Tanjilur Rahman Abid",
    "Sk. Md. Sunny Hossain",
  ];
  const users = await prisma.user.findMany({
    where: { fullName: { in: names }, isActive: true },
    include: { homeAddress: true },
  });
  console.log("Office (Regnum):", { lat: 23.794456, lng: 90.370317 });

  const grouped = new Map<string, string>();
  for (const u of users) {
    const a = u.homeAddress;
    console.log(
      `${u.fullName}\n  addr="${u.address}"\n  home=${a ? `lat=${a.latitude} lng=${a.longitude} (${a.latitude},${a.longitude})` : "NONE"} geohash=${a ? Math.floor(a.latitude * 100) : "-"}`
    );
    grouped.set(u.fullName, a ? `${a.latitude},${a.longitude}` : "none");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});