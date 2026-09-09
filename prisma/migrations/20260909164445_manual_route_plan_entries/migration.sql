-- CreateTable
CREATE TABLE "ManualRoutePlanEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftKey" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "addressId" TEXT,
    "pickupLabel" TEXT NOT NULL,
    "pickupMinutes" INTEGER NOT NULL,
    "orderIndex" INTEGER,
    "officeLabel" TEXT NOT NULL,
    "arrivalMinutes" INTEGER NOT NULL,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualRoutePlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualRoutePlanEntry_shiftKey_idx" ON "ManualRoutePlanEntry"("shiftKey");

-- CreateIndex
CREATE INDEX "ManualRoutePlanEntry_date_idx" ON "ManualRoutePlanEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ManualRoutePlanEntry_date_shiftKey_vehicleNumber_employeeId_key" ON "ManualRoutePlanEntry"("date", "shiftKey", "vehicleNumber", "employeeId");

-- AddForeignKey
ALTER TABLE "ManualRoutePlanEntry" ADD CONSTRAINT "ManualRoutePlanEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
