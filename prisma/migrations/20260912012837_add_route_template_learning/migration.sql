-- CreateTable
CREATE TABLE "RouteTemplate" (
    "id" TEXT NOT NULL,
    "shiftKey" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "arrivalTime" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "sourcePlanId" TEXT,
    "lastLearnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteTemplateStop" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "employeeId" TEXT,
    "pickupType" TEXT,
    "pickupPointId" TEXT,
    "addressId" TEXT,
    "pickupTime" TEXT,
    "employeeLabel" TEXT,
    "stopLabel" TEXT,

    CONSTRAINT "RouteTemplateStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteTemplate_shiftKey_office_idx" ON "RouteTemplate"("shiftKey", "office");

-- CreateIndex
CREATE UNIQUE INDEX "RouteTemplate_vehicleId_arrivalTime_key" ON "RouteTemplate"("vehicleId", "arrivalTime");

-- CreateIndex
CREATE INDEX "RouteTemplateStop_employeeId_idx" ON "RouteTemplateStop"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteTemplateStop_templateId_seq_key" ON "RouteTemplateStop"("templateId", "seq");

-- AddForeignKey
ALTER TABLE "RouteTemplate" ADD CONSTRAINT "RouteTemplate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTemplateStop" ADD CONSTRAINT "RouteTemplateStop_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RouteTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTemplateStop" ADD CONSTRAINT "RouteTemplateStop_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
