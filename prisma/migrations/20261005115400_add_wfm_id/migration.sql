-- AlterTable (reconstructed 2026-10-15): this migration was applied to the
-- database on 2026-10-05 outside this repo's history. The file is restored
-- here so `prisma migrate` history matches the live database; the column
-- already exists and will not be re-applied.
ALTER TABLE "User" ADD COLUMN "wfmId" TEXT;
