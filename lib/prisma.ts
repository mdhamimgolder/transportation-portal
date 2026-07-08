import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// WAL mode lets readers run concurrently with a writer instead of blocking
// on SQLite's default rollback journal -- matters once many employees are
// submitting around the same deadline. Idempotent: a no-op once already WAL.
void prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL;");
