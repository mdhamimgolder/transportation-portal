-- AlterTable
ALTER TABLE "RoutePlan" ADD COLUMN     "destinationLat" DOUBLE PRECISION,
ADD COLUMN     "destinationLng" DOUBLE PRECISION,
ADD COLUMN     "officeLocation" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "officeLocation" TEXT NOT NULL DEFAULT 'Regnum';

-- CreateIndex
CREATE INDEX "Vehicle_officeLocation_idx" ON "Vehicle"("officeLocation");
