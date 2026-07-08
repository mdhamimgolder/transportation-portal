-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeCode" TEXT,
    "contactNumber" TEXT,
    "address" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "isBulkCreated" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "passwordResetToken" TEXT,
    "passwordResetExpires" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "zoneId" TEXT,
    CONSTRAINT "User_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AddressChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "oldAddress" TEXT NOT NULL,
    "newAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AddressChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AddressChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "oldContactNumber" TEXT NOT NULL,
    "newContactNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContactChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContactChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "weekStartDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklySchedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyScheduleDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weeklyScheduleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "needsTransport" BOOLEAN NOT NULL DEFAULT true,
    "arrivalTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyScheduleDay_weeklyScheduleId_fkey" FOREIGN KEY ("weeklyScheduleId") REFERENCES "WeeklySchedule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdHocRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "arrivalTime" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdHocRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RouteAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weeklyScheduleDayId" TEXT,
    "adHocRequestId" TEXT,
    "vehicleDriverId" TEXT NOT NULL,
    "pickupTime" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailSentAt" DATETIME,
    "noShow" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RouteAssignment_weeklyScheduleDayId_fkey" FOREIGN KEY ("weeklyScheduleDayId") REFERENCES "WeeklyScheduleDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RouteAssignment_adHocRequestId_fkey" FOREIGN KEY ("adHocRequestId") REFERENCES "AdHocRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RouteAssignment_vehicleDriverId_fkey" FOREIGN KEY ("vehicleDriverId") REFERENCES "VehicleDriver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleDriver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "User_zoneId_idx" ON "User"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AddressChangeRequest_employeeId_idx" ON "AddressChangeRequest"("employeeId");

-- CreateIndex
CREATE INDEX "AddressChangeRequest_status_idx" ON "AddressChangeRequest"("status");

-- CreateIndex
CREATE INDEX "AddressChangeRequest_createdAt_idx" ON "AddressChangeRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ContactChangeRequest_employeeId_idx" ON "ContactChangeRequest"("employeeId");

-- CreateIndex
CREATE INDEX "ContactChangeRequest_status_idx" ON "ContactChangeRequest"("status");

-- CreateIndex
CREATE INDEX "ContactChangeRequest_createdAt_idx" ON "ContactChangeRequest"("createdAt");

-- CreateIndex
CREATE INDEX "WeeklySchedule_weekStartDate_idx" ON "WeeklySchedule"("weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklySchedule_status_idx" ON "WeeklySchedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySchedule_employeeId_weekStartDate_key" ON "WeeklySchedule"("employeeId", "weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyScheduleDay_date_idx" ON "WeeklyScheduleDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScheduleDay_weeklyScheduleId_dayOfWeek_key" ON "WeeklyScheduleDay"("weeklyScheduleId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "AdHocRequest_date_idx" ON "AdHocRequest"("date");

-- CreateIndex
CREATE INDEX "AdHocRequest_status_idx" ON "AdHocRequest"("status");

-- CreateIndex
CREATE INDEX "AdHocRequest_employeeId_idx" ON "AdHocRequest"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteAssignment_weeklyScheduleDayId_key" ON "RouteAssignment"("weeklyScheduleDayId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteAssignment_adHocRequestId_key" ON "RouteAssignment"("adHocRequestId");

-- CreateIndex
CREATE INDEX "RouteAssignment_vehicleDriverId_idx" ON "RouteAssignment"("vehicleDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDriver_vehicleNumber_key" ON "VehicleDriver"("vehicleNumber");

-- CreateIndex
CREATE INDEX "VehicleDriver_isActive_idx" ON "VehicleDriver"("isActive");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_actionType_idx" ON "AuditLog"("actionType");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

