-- DropIndex
DROP INDEX "AdHocRequest_status_idx";

-- DropIndex
DROP INDEX "EmailNotificationLog_routeAssignmentId_idx";

-- DropIndex
DROP INDEX "PickupPoint_vehicleId_sequence_idx";

-- DropIndex
DROP INDEX "TripAssignment_routePlanId_idx";

-- DropIndex
DROP INDEX "TripAssignment_routePlanId_vehicleId_idx";

-- DropIndex
DROP INDEX "User_role_idx";

-- DropIndex
DROP INDEX "WeeklySchedule_status_idx";

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- CreateIndex
CREATE INDEX "AddressChangeRequest_reviewedById_idx" ON "AddressChangeRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "ContactChangeRequest_reviewedById_idx" ON "ContactChangeRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "ManualRoutePlanEntry_employeeId_idx" ON "ManualRoutePlanEntry"("employeeId");

-- CreateIndex
CREATE INDEX "PickupPointChangeRequest_reviewedById_idx" ON "PickupPointChangeRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "RoutePlan_previousRoutePlanId_idx" ON "RoutePlan"("previousRoutePlanId");

-- CreateIndex
CREATE INDEX "RoutePlanOverride_routePlanId_idx" ON "RoutePlanOverride"("routePlanId");

-- CreateIndex
CREATE INDEX "TripAssignment_pickupPointId_idx" ON "TripAssignment"("pickupPointId");

-- CreateIndex
CREATE INDEX "TripAssignment_pickupAddressId_idx" ON "TripAssignment"("pickupAddressId");
