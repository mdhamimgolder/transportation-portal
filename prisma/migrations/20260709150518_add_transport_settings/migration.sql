-- CreateTable
CREATE TABLE "TransportSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "weeklyLockDayOfWeek" INTEGER NOT NULL DEFAULT 6,
    "weeklyLockHour" INTEGER NOT NULL DEFAULT 12,
    "weeklyLockMinute" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettings_pkey" PRIMARY KEY ("id")
);
