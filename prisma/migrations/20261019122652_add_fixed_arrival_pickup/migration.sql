-- CreateTable
CREATE TABLE "FixedArrivalPickup" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "vehicleDriverId" TEXT NOT NULL,
    "pickupTime" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedArrivalPickup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedArrivalPickup_employeeId_key" ON "FixedArrivalPickup"("employeeId");

-- CreateIndex
CREATE INDEX "FixedArrivalPickup_vehicleDriverId_idx" ON "FixedArrivalPickup"("vehicleDriverId");

-- AddForeignKey
ALTER TABLE "FixedArrivalPickup" ADD CONSTRAINT "FixedArrivalPickup_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedArrivalPickup" ADD CONSTRAINT "FixedArrivalPickup_vehicleDriverId_fkey" FOREIGN KEY ("vehicleDriverId") REFERENCES "VehicleDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
