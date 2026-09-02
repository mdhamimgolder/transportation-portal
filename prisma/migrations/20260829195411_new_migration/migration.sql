-- CreateTable
CREATE TABLE "PickupPoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "baseETA" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PickupPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "driverName" TEXT,
    "driverContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleShiftAssignment" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "shifts" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "readyForReuseAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlan" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "dayDate" TIMESTAMP(3) NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "arrivalTime" TEXT NOT NULL,
    "routeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "previousRoutePlanId" TEXT,
    "departureTime" TIMESTAMP(3),
    "estimatedCompletionTime" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "RoutePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripAssignment" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "weeklyScheduleDayId" TEXT,
    "employeeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "pickupType" TEXT NOT NULL,
    "pickupPointId" TEXT,
    "pickupAddressId" TEXT,
    "pickupTime" TEXT,
    "pickupETA" TIMESTAMP(3),
    "sequenceInTrip" INTEGER NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manuallyOverridden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlanOverride" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "affectedEmployeeId" TEXT,
    "beforeState" TEXT NOT NULL,
    "afterState" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutePlanOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistanceMatrixCache" (
    "id" TEXT NOT NULL,
    "fromLat" DOUBLE PRECISION NOT NULL,
    "fromLng" DOUBLE PRECISION NOT NULL,
    "toLat" DOUBLE PRECISION NOT NULL,
    "toLng" DOUBLE PRECISION NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistanceMatrixCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickupPoint_vehicleId_sequence_idx" ON "PickupPoint"("vehicleId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PickupPoint_vehicleId_sequence_key" ON "PickupPoint"("vehicleId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleNumber_key" ON "Vehicle"("vehicleNumber");

-- CreateIndex
CREATE INDEX "Vehicle_vehicleType_idx" ON "Vehicle"("vehicleType");

-- CreateIndex
CREATE INDEX "Vehicle_isActive_idx" ON "Vehicle"("isActive");

-- CreateIndex
CREATE INDEX "VehicleShiftAssignment_vehicleId_startDate_idx" ON "VehicleShiftAssignment"("vehicleId", "startDate");

-- CreateIndex
CREATE INDEX "RoutePlan_dayDate_arrivalTime_idx" ON "RoutePlan"("dayDate", "arrivalTime");

-- CreateIndex
CREATE INDEX "RoutePlan_status_idx" ON "RoutePlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlan_dayDate_vehicleId_arrivalTime_key" ON "RoutePlan"("dayDate", "vehicleId", "arrivalTime");

-- CreateIndex
CREATE INDEX "TripAssignment_employeeId_idx" ON "TripAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "TripAssignment_vehicleId_idx" ON "TripAssignment"("vehicleId");

-- CreateIndex
CREATE INDEX "TripAssignment_weeklyScheduleDayId_idx" ON "TripAssignment"("weeklyScheduleDayId");

-- CreateIndex
CREATE UNIQUE INDEX "TripAssignment_routePlanId_employeeId_weeklyScheduleDayId_key" ON "TripAssignment"("routePlanId", "employeeId", "weeklyScheduleDayId");

-- CreateIndex
CREATE INDEX "RoutePlanOverride_changedById_createdAt_idx" ON "RoutePlanOverride"("changedById", "createdAt");

-- CreateIndex
CREATE INDEX "DistanceMatrixCache_expiresAt_idx" ON "DistanceMatrixCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistanceMatrixCache_fromLat_fromLng_toLat_toLng_provider_key" ON "DistanceMatrixCache"("fromLat", "fromLng", "toLat", "toLng", "provider");

-- AddForeignKey
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleShiftAssignment" ADD CONSTRAINT "VehicleShiftAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_previousRoutePlanId_fkey" FOREIGN KEY ("previousRoutePlanId") REFERENCES "RoutePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAssignment" ADD CONSTRAINT "TripAssignment_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAssignment" ADD CONSTRAINT "TripAssignment_weeklyScheduleDayId_fkey" FOREIGN KEY ("weeklyScheduleDayId") REFERENCES "WeeklyScheduleDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAssignment" ADD CONSTRAINT "TripAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAssignment" ADD CONSTRAINT "TripAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAssignment" ADD CONSTRAINT "TripAssignment_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAssignment" ADD CONSTRAINT "TripAssignment_pickupAddressId_fkey" FOREIGN KEY ("pickupAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlanOverride" ADD CONSTRAINT "RoutePlanOverride_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
