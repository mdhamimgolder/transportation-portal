"use client";

import { useCallback } from "react";
import {
  reorderRouteTrips,
  moveTripToRoute,
  moveTripToUnusedVehicle,
  adjustPickupTime,
  finalizeRoute,
} from "@/actions/route-override.actions";
import {
  getRoutePlanDetail,
  type GeneratedRouteDetail,
} from "@/actions/route-generation.actions";

interface UseDragActionsOptions {
  onRouteUpdated: (updated: GeneratedRouteDetail) => void;
  onChanged: () => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export function useDragActions({
  onRouteUpdated,
  onChanged,
  onError,
  onSuccess,
}: UseDragActionsOptions) {
  /** In-place single-route refresh — patches just this route's card instead of
   *  re-fetching the whole week (no loading skeleton / full-page refresh after
   *  a finalize, reorder or time edit). Falls back to the full refresh only if
   *  the targeted fetch comes back empty. */
  const refreshSingle = useCallback(
    async (routeId: string) => {
      try {
        const updated = await getRoutePlanDetail(routeId);
        if (updated) {
          onRouteUpdated(updated);
          return;
        }
      } catch {
        // fall through to the full refresh so the UI never goes stale
      }
      onChanged();
    },
    [onChanged, onRouteUpdated]
  );

  const handleReorder = useCallback(
    async (routeId: string, orderedTripIds: string[]) => {
      try {
        const res = await reorderRouteTrips(routeId, orderedTripIds);
        if (res.success) {
          onSuccess?.(res.message ?? "Row reordered — pickup times recalculated.");
          await refreshSingle(routeId);
        } else {
          onError?.(res.error ?? "Failed to reorder rows.");
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Failed to reorder rows.");
      }
    },
    [onError, onSuccess, refreshSingle]
  );

interface MoveOptions {
  /** Insert the moved rider directly before this target trip's row (exact
   *  drop position for dynamic routes). Preset routes ignore it — the point
   *  sequence governs. */
  insertBeforeTripId?: string;
  /** Set when the target is a pinned-but-unused vehicle card (create the
   *  plan on that vehicle first, then move). */
  targetVehicleId?: string;
}

  const handleMove = useCallback(
    async (tripId: string, targetRouteId: string, isPinnedNotMapped: boolean, options?: MoveOptions) => {
      try {
        let res;
        if (isPinnedNotMapped && options?.targetVehicleId) {
          res = await moveTripToUnusedVehicle(tripId, options.targetVehicleId);
        } else {
          res = await moveTripToRoute(tripId, targetRouteId, options?.insertBeforeTripId
            ? { insertBeforeTripId: options.insertBeforeTripId }
            : undefined);
        }
        if (res.success) {
          onSuccess?.(res.message ?? "Employee moved.");
          onChanged();
        } else {
          onError?.(res.error ?? "Failed to move employee.");
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Failed to move employee.");
      }
    },
    [onChanged, onError, onSuccess]
  );

  const handleAdjustTime = useCallback(
    async (tripId: string, newTime: string) => {
      try {
        const res = await adjustPickupTime(tripId, newTime);
        if (res.success) {
          onSuccess?.(res.message ?? "Pickup time updated.");
          // Patch just the edited route in place (no skeleton flash); the
          // week-mirrored sibling days update server-side and appear on
          // their next load.
          const routeId = res.assignment?.routePlan?.id;
          if (routeId) {
            await refreshSingle(routeId);
          } else {
            onChanged();
          }
        } else {
          onError?.(res.message ?? "Failed to update pickup time.");
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Failed to update pickup time.");
      }
    },
    [onChanged, onError, onSuccess, refreshSingle]
  );

  const handleFinalize = useCallback(
    async (routeId: string): Promise<boolean> => {
      try {
        const res = await finalizeRoute(routeId);
        onSuccess?.(res.message ?? "Route finalized and emails dispatched.");
        // In-place patch: the card flips to FINALIZED with no page refresh.
        await refreshSingle(routeId);
        return true;
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Failed to finalize route.");
        return false;
      }
    },
    [onError, onSuccess, refreshSingle]
  );

  return {
    handleReorder,
    handleMove,
    handleAdjustTime,
    handleFinalize,
  };
}