"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { arrivalMinutesForLabel } from "@/lib/constants/route-shifts";
import {
  computeRouteAnalysis,
  loadAnalysisInput,
} from "@/lib/routing/route-analysis";
import type {
  CandidateId,
  RouteAnalysis,
  RouteCandidate,
  ViaPoint,
} from "@/lib/routing/route-analysis.types";
import { backCalculatePickupMinutes } from "@/lib/routing/schedule-math";
import { minutesToTimeString } from "@/lib/routing/utils";
import { reorderPickupPoints } from "@/actions/route-setting.actions";

export type AnalyzeRouteResult =
  | { success: true; analysis: RouteAnalysis; cached: boolean }
  | { success: false; error: string };

function isRouteAnalysis(value: unknown): value is RouteAnalysis {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { candidates?: unknown }).candidates)
  );
}

/**
 * Analyze one RoutePlan: side-of-road per stop, alternative order, scores and
 * geometry for each candidate. Cached on the plan and reused while its stops,
 * order and coordinates are unchanged (`inputHash`); `force` recomputes.
 */
export async function analyzeRoutePlan(
  routePlanId: string,
  options?: { force?: boolean }
): Promise<AnalyzeRouteResult> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const input = await loadAnalysisInput(routePlanId);
    if (!options?.force) {
      const plan = await prisma.routePlan.findUnique({
        where: { id: routePlanId },
        select: { routeAnalysis: true },
      });
      const cached = plan?.routeAnalysis;
      if (isRouteAnalysis(cached) && cached.inputHash === input.inputHash) {
        return { success: true, analysis: cached, cached: true };
      }
    }

    const analysis = await computeRouteAnalysis(input);
    await prisma.routePlan.update({
      where: { id: routePlanId },
      data: { routeAnalysis: analysis as unknown as Prisma.InputJsonValue },
    });
    return { success: true, analysis, cached: false };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Route analysis failed.",
    };
  }
}

export type SaveManualAdjustmentResult = { success: boolean; error?: string };

/**
 * Persist a Google-Maps-style route adjustment made on the map. The adjusted
 * road geometry (drawn through the user's via points) is stored as a new
 * "manual" candidate inside the plan's cached analysis so the map keeps
 * drawing it after a reload, `appliedCandidateId` moves to "manual", and a
 * `ROUTE_GEOMETRY_ADJUST` override is audited. Stop order and pickup times are
 * not touched — only the driven path changes.
 */
export async function saveManualGeometryAdjustment(
  routePlanId: string,
  geometry: [number, number][],
  viaPoints: ViaPoint[],
  totals: { minutes: number; km: number }
): Promise<SaveManualAdjustmentResult> {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const plan = await prisma.routePlan.findUnique({
      where: { id: routePlanId },
      include: {
        tripAssignments: { select: { id: true }, orderBy: { sequenceInTrip: "asc" } },
      },
    });
    if (!plan) return { success: false, error: "Route plan not found." };
    if (plan.status === "EXECUTED") {
      return { success: false, error: "An executed route cannot be changed." };
    }
    if (!Array.isArray(geometry) || geometry.length < 2) {
      return { success: false, error: "The adjusted path has no geometry." };
    }
    if (!isRouteAnalysis(plan.routeAnalysis)) {
      return { success: false, error: "Analyze the route first." };
    }
    const analysis = plan.routeAnalysis;
    const baseCandidate =
      analysis.candidates.find(
        (c) => c.id === (plan.appliedCandidateId ?? "current")
      ) ??
      analysis.candidates.find((c) => c.id === "current") ??
      analysis.candidates[0];
    if (!baseCandidate) {
      return { success: false, error: "No route candidates to adjust from." };
    }

    const manualCandidate: RouteCandidate = {
      ...baseCandidate,
      id: "manual",
      label: "Manual route",
      description:
        viaPoints.length > 0
          ? `Adjusted by Facilities on the map (${viaPoints.length} via point${viaPoints.length > 1 ? "s" : ""}).`
          : "Adjusted by Facilities on the map.",
      geometry,
      metrics: {
        ...baseCandidate.metrics,
        durationMin: Math.max(0, totals.minutes),
        distanceKm: Math.max(0, totals.km),
      },
      score: baseCandidate.score + 1,
    };

    const candidates = analysis.candidates.filter((c) => c.id !== "manual");
    candidates.push(manualCandidate);

    await prisma.$transaction([
      prisma.routePlan.update({
        where: { id: routePlanId },
        data: {
          routeAnalysis: {
            version: analysis.version,
            computedAt: analysis.computedAt,
            inputHash: analysis.inputHash,
            topology: analysis.topology,
            sideResolution: analysis.sideResolution,
            waypoints: analysis.waypoints,
            candidates,
            recommendedId: analysis.recommendedId,
            notes: analysis.notes,
          } as unknown as Prisma.InputJsonValue,
          appliedCandidateId: "manual",
        },
      }),
      prisma.routePlanOverride.create({
        data: {
          routePlanId,
          changedById: session.id,
          changeType: "ROUTE_GEOMETRY_ADJUST",
          beforeState: JSON.stringify({
            appliedCandidateId: plan.appliedCandidateId,
          }),
          afterState: JSON.stringify({
            appliedCandidateId: "manual",
            viaPoints,
            totals,
            geometryPointCount: geometry.length,
          }),
          reason: `Adjusted route direction on the map (${viaPoints.length} via point${viaPoints.length === 1 ? "" : "s"}).`,
        },
      }),
    ]);

    revalidatePath("/facilities/automated-route-planner");
    revalidatePath("/facilities/route-planning");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save the route adjustment.",
    };
  }
}

export type ApplyCandidateResult = { success: boolean; error?: string };

/**
 * Apply a candidate from the cached analysis to the plan: re-sequence the
 * trips, back-calculate pickup times from the shift's arrival with the
 * candidate's real leg minutes (5-minute grid, ≥ 5 min gaps), store each
 * stop's chosen carriageway, and record a RoutePlanOverride. For 10 PM preset
 * routes the vehicle's default pickup sequence in Route Setting can be
 * updated too, so future weeks inherit the order.
 */
export async function applyRouteCandidate(
  routePlanId: string,
  candidateId: CandidateId,
  options?: { alsoUpdatePresetSequence?: boolean; reason?: string }
): Promise<ApplyCandidateResult> {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const plan = await prisma.routePlan.findUnique({
      where: { id: routePlanId },
      include: {
        tripAssignments: { orderBy: { sequenceInTrip: "asc" } },
      },
    });
    if (!plan) return { success: false, error: "Route plan not found." };
    if (plan.status === "EXECUTED") {
      return { success: false, error: "An executed route cannot be changed." };
    }

    const analysis = plan.routeAnalysis;
    if (!isRouteAnalysis(analysis)) {
      return { success: false, error: "Analyze the route first." };
    }
    const input = await loadAnalysisInput(routePlanId);
    if (analysis.inputHash !== input.inputHash) {
      return { success: false, error: "The route changed since it was analyzed — analyze it again." };
    }
    const candidate = analysis.candidates.find((c) => c.id === candidateId);
    if (!candidate) return { success: false, error: "That candidate is not part of the analysis." };

    const arrivalMinutes = arrivalMinutesForLabel(plan.arrivalTime);
    if (arrivalMinutes == null) {
      return { success: false, error: `Unknown arrival label "${plan.arrivalTime}".` };
    }

    // Stops in drive order (office removed) with their trips and legs.
    const waypointByIndex = new Map(analysis.waypoints.map((w) => [w.index, w]));
    const positions = candidate.order
      .map((w, pos) => ({ w, pos }))
      .filter(({ w }) => !waypointByIndex.get(w)?.isOffice);
    if (positions.length === 0) return { success: false, error: "Candidate has no stops." };

    // leg k = order[k] → order[k+1]; for a stop at position p its onward leg is legMinutes[p].
    const legsToNext = positions.map(({ pos }) =>
      Math.max(1, Math.round(candidate.legMinutes[pos] ?? 1))
    );
    let pickupMinutes: number[];
    try {
      pickupMinutes = backCalculatePickupMinutes(arrivalMinutes, legsToNext);
    } catch {
      return {
        success: false,
        error: `This order takes ${legsToNext.reduce((a, b) => a + b, 0)} min — longer than the ${plan.arrivalTime} window allows.`,
      };
    }

    const officeToFirst =
      analysis.topology === "loop"
        ? candidate.legMinutes[0] ?? null
        : candidate.officeToFirstMinutes;
    const departureMinutes =
      officeToFirst != null ? pickupMinutes[0] - Math.max(1, Math.round(officeToFirst)) : null;

    const tripById = new Map(plan.tripAssignments.map((t) => [t.id, t]));
    const updates: Array<{
      id: string;
      sequenceInTrip: number;
      pickupTime: string;
      approachBearing: number | null;
      snappedLat: number | null;
      snappedLng: number | null;
    }> = [];
    let seq = 0;
    positions.forEach(({ w, pos }, i) => {
      const wp = waypointByIndex.get(w)!;
      const stop = candidate.stops[pos];
      for (const tripId of wp.tripIds) {
        if (!tripById.has(tripId)) continue;
        seq++;
        updates.push({
          id: tripId,
          sequenceInTrip: seq,
          pickupTime: minutesToTimeString(pickupMinutes[i]),
          approachBearing: stop?.headingDeg ?? null,
          snappedLat: stop?.snappedLat ?? null,
          snappedLng: stop?.snappedLng ?? null,
        });
      }
    });
    // Trips left out of the analysis (no coordinates) keep riding, at the end.
    for (const t of plan.tripAssignments) {
      if (updates.some((u) => u.id === t.id)) continue;
      seq++;
      updates.push({
        id: t.id,
        sequenceInTrip: seq,
        pickupTime: t.pickupTime ?? minutesToTimeString(pickupMinutes[pickupMinutes.length - 1]),
        approachBearing: null,
        snappedLat: null,
        snappedLng: null,
      });
    }

    const before = plan.tripAssignments.map((t) => ({
      tripId: t.id,
      employeeId: t.employeeId,
      sequenceInTrip: t.sequenceInTrip,
      pickupTime: t.pickupTime,
    }));
    const after = updates.map((u) => {
      const t = tripById.get(u.id)!;
      return { tripId: u.id, employeeId: t.employeeId, sequenceInTrip: u.sequenceInTrip, pickupTime: u.pickupTime };
    });

    const departureDate =
      departureMinutes != null && plan.routeType !== "PRESET_10PM"
        ? (() => {
            const d = new Date(plan.dayDate);
            d.setHours(0, 0, 0, 0);
            d.setMinutes(Math.max(0, departureMinutes));
            return d;
          })()
        : undefined;

    await prisma.$transaction([
      ...updates.map((u) =>
        prisma.tripAssignment.update({
          where: { id: u.id },
          data: {
            sequenceInTrip: u.sequenceInTrip,
            pickupTime: u.pickupTime,
            approachBearing: u.approachBearing,
            snappedLat: u.snappedLat,
            snappedLng: u.snappedLng,
            manuallyOverridden: true,
          },
        })
      ),
      prisma.routePlan.update({
        where: { id: routePlanId },
        data: {
          appliedCandidateId: candidateId,
          ...(departureDate ? { departureTime: departureDate } : {}),
        },
      }),
      prisma.routePlanOverride.create({
        data: {
          routePlanId,
          changedById: session.id,
          changeType: "ROUTE_OPTIMIZED",
          beforeState: JSON.stringify({ trips: before }),
          afterState: JSON.stringify({
            candidate: candidateId,
            score: candidate.score,
            metrics: candidate.metrics,
            trips: after,
          }),
          reason:
            options?.reason ??
            `Applied "${candidate.label}" from the route analysis (${candidate.metrics.durationMin} min, ${candidate.metrics.distanceKm} km).`,
        },
      }),
    ]);

    if (options?.alsoUpdatePresetSequence && plan.routeType === "PRESET_10PM") {
      const pointIdsInOrder: string[] = [];
      for (const u of updates) {
        const pid = tripById.get(u.id)?.pickupPointId;
        if (pid && !pointIdsInOrder.includes(pid)) pointIdsInOrder.push(pid);
      }
      const active = await prisma.pickupPoint.findMany({
        where: { vehicleId: plan.vehicleId, isActive: true },
        orderBy: { sequence: "asc" },
        select: { id: true },
      });
      const rest = active.map((p) => p.id).filter((id) => !pointIdsInOrder.includes(id));
      const res = await reorderPickupPoints(plan.vehicleId, [...pointIdsInOrder, ...rest]);
      if (!res.success) {
        return {
          success: true,
          error: `Route updated, but the vehicle's preset sequence was not: ${res.error ?? "unknown error"}`,
        };
      }
    }

    revalidatePath("/facilities/automated-route-planner");
    revalidatePath("/facilities/route-planning");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to apply the route candidate.",
    };
  }
}
