import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { signSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const USERS = [
  { role: "EMPLOYEE", email: "employee@example.com" },
  { role: "CORPORATE_EMPLOYEE", email: "corporate@example.com" },
  { role: "OPERATIONS", email: "operations@example.com" },
  { role: "FACILITIES", email: "facilities@example.com" },
  { role: "SUPER_ADMIN", email: "superadmin@example.com" },
];

async function main() {
  for (const u of USERS) {
    const user = await prisma.user.findUnique({
      where: { email: u.email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        mustChangePassword: true,
        isActive: true,
      },
    });
    if (!user) {
      console.log(`${u.role}: NO USER`);
      continue;
    }
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await prisma.session.create({
      data: { userId: user.id, sessionToken: jti, expiresAt },
    });
    const token = await signSessionToken({
      sub: user.id,
      role: user.role as never,
      mustChangePassword: user.mustChangePassword,
      jti,
    });
    console.log(`${u.role}\t${user.id}\t${SESSION_COOKIE_NAME}=${token}`);
  }
}

main().finally(() => prisma.$disconnect());
