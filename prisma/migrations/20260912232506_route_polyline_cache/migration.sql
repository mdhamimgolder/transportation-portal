-- CreateTable
CREATE TABLE "RoutePolylineCache" (
    "id" TEXT NOT NULL,
    "fromLat" DOUBLE PRECISION NOT NULL,
    "fromLng" DOUBLE PRECISION NOT NULL,
    "toLat" DOUBLE PRECISION NOT NULL,
    "toLng" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePolylineCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutePolylineCache_expiresAt_idx" ON "RoutePolylineCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePolylineCache_fromLat_fromLng_toLat_toLng_provider_key" ON "RoutePolylineCache"("fromLat", "fromLng", "toLat", "toLng", "provider");
