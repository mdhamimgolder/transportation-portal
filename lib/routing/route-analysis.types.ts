/**
 * Shared (server + client) shapes of a route analysis. No runtime imports so
 * the client bundle can use them without pulling in Prisma.
 */

import type { RouteMetrics } from "./side-selection";

export type CandidateId = "current" | "current_sided" | "optimized" | "manual";

/** A user-dropped via point on the map that bends the driven path through it
 * (Google-Maps-style route adjustment). `sequence` groups drag gestures;
 * persisted inside RoutePlanOverride.afterState and the analysis candidates. */
export interface ViaPoint {
  lat: number;
  lng: number;
}

/** One physical stop on the route (several employees may share it). */
export interface AnalysisWaypoint {
  index: number;
  lat: number;
  lng: number;
  label: string;
  isOffice: boolean;
  /** TripAssignment ids picked up here, in stored sequence order. */
  tripIds: string[];
  employeeNames: string[];
  /** Road km from this stop to the office (best side); null if unknown. */
  toOfficeKm: number | null;
}

export interface CandidateStop {
  waypoint: number;
  /** Heading the vehicle faces at the stop (null = not constrained). */
  headingDeg: number | null;
  snappedLat: number | null;
  snappedLng: number | null;
}

export interface RouteCandidate {
  id: CandidateId;
  label: string;
  description: string;
  /** Waypoint indices in drive order (office included where it is driven). */
  order: number[];
  /** One entry per position of `order`. */
  stops: CandidateStop[];
  /** Road geometry as [lat, lng]. */
  geometry: Array<[number, number]>;
  /** Drive minutes per leg (leg k = order[k] → order[k+1]). */
  legMinutes: number[];
  legKm: number[];
  metrics: RouteMetrics;
  score: number;
  /** Office → first pickup minutes when the office is not driven as a waypoint (chain). */
  officeToFirstMinutes: number | null;
}

export interface RouteAnalysis {
  version: 1;
  computedAt: string;
  /** Hash of stops / coordinates / order the analysis was computed for. */
  inputHash: string;
  /** chain = pickups → office; loop = office → pickups → office (late night). */
  topology: "chain" | "loop";
  /** Whether per-stop heading candidates could be priced (bearings) or not. */
  sideResolution: "bearings" | "unconstrained";
  waypoints: AnalysisWaypoint[];
  candidates: RouteCandidate[];
  /** Lowest composite score (ties keep the least change). */
  recommendedId: CandidateId;
  notes: string[];
}
