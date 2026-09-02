-- CreateTable
CREATE TABLE "RouteLegLearning" (
    "id" TEXT NOT NULL,
    "fromKey" TEXT NOT NULL,
    "toKey" TEXT NOT NULL,
    "fromLabel" TEXT,
    "toLabel" TEXT,
    "shiftKey" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "avgMinutes" DOUBLE PRECISION NOT NULL,
    "minMinutes" DOUBLE PRECISION NOT NULL,
    "maxMinutes" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteLegLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteLegLearning_shiftKey_idx" ON "RouteLegLearning"("shiftKey");

-- CreateIndex
CREATE INDEX "RouteLegLearning_updatedAt_idx" ON "RouteLegLearning"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RouteLegLearning_fromKey_toKey_shiftKey_key" ON "RouteLegLearning"("fromKey", "toKey", "shiftKey");
