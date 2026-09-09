-- AlterTable
ALTER TABLE "RoutePlan" ADD COLUMN     "appliedCandidateId" TEXT,
ADD COLUMN     "routeAnalysis" JSONB;

-- AlterTable
ALTER TABLE "TripAssignment" ADD COLUMN     "approachBearing" INTEGER,
ADD COLUMN     "snappedLat" DOUBLE PRECISION,
ADD COLUMN     "snappedLng" DOUBLE PRECISION;
