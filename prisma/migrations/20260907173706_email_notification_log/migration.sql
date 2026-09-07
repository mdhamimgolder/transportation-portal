-- CreateTable
CREATE TABLE "EmailNotificationLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "routeAssignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailNotificationLog_routeAssignmentId_idx" ON "EmailNotificationLog"("routeAssignmentId");

-- CreateIndex
CREATE INDEX "EmailNotificationLog_status_idx" ON "EmailNotificationLog"("status");

-- CreateIndex
CREATE INDEX "EmailNotificationLog_createdAt_idx" ON "EmailNotificationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "EmailNotificationLog" ADD CONSTRAINT "EmailNotificationLog_routeAssignmentId_fkey" FOREIGN KEY ("routeAssignmentId") REFERENCES "RouteAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
