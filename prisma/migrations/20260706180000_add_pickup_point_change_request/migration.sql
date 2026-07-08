-- CreateTable
CREATE TABLE "PickupPointChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "oldPickupPoint" TEXT NOT NULL,
    "newPickupPoint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PickupPointChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PickupPointChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PickupPointChangeRequest_employeeId_idx" ON "PickupPointChangeRequest"("employeeId");

-- CreateIndex
CREATE INDEX "PickupPointChangeRequest_status_idx" ON "PickupPointChangeRequest"("status");

-- CreateIndex
CREATE INDEX "PickupPointChangeRequest_createdAt_idx" ON "PickupPointChangeRequest"("createdAt");
