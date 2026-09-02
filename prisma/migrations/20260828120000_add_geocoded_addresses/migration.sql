CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Address_addressText_key" ON "Address"("addressText");
CREATE INDEX "Address_latitude_longitude_idx" ON "Address"("latitude", "longitude");

ALTER TABLE "User" ADD COLUMN "homeAddressId" TEXT;
ALTER TABLE "User" ADD COLUMN "pickupAddressId" TEXT;
ALTER TABLE "RouteAssignment" ADD COLUMN "vehicleType" TEXT;
ALTER TABLE "RouteAssignment" ADD COLUMN "pickupLat" DOUBLE PRECISION;
ALTER TABLE "RouteAssignment" ADD COLUMN "pickupLng" DOUBLE PRECISION;
ALTER TABLE "RouteAssignment" ADD COLUMN "pickupAddress" TEXT;

CREATE INDEX "User_homeAddressId_idx" ON "User"("homeAddressId");
CREATE INDEX "User_pickupAddressId_idx" ON "User"("pickupAddressId");
ALTER TABLE "User" ADD CONSTRAINT "User_homeAddressId_fkey" FOREIGN KEY ("homeAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_pickupAddressId_fkey" FOREIGN KEY ("pickupAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;