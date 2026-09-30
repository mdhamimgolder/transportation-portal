"use client";

import { useCallback, useRef, useState } from "react";

interface UseDragPreviewOptions {
  getStopsForRoute: (routeId: string) => Array<{ id: string; sequence: number }>;
  getRouteGeometry: (routeId: string, orderedTripIds: string[]) => Promise<{
    geometry: [number, number][];
    legMinutes: number[];
  } | null>;
  onPreviewChange?: (routeId: string, previewOrder: string[] | null, geometry: [number, number][] | null) => void;
}

export function useDragPreview({
  getStopsForRoute,
  getRouteGeometry,
  onPreviewChange,
}: UseDragPreviewOptions) {
  const [previewState, setPreviewState] = useState<Map<string, {
    orderedTripIds: string[];
    geometry: [number, number][] | null;
  }>>(new Map());

  const debounceRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const activeDragRef = useRef<{ routeId: string; sourceTripId: string } | null>(null);
  // The LATEST prospective order per route — the async geometry must resolve
  // against this, otherwise a slow OSRM response overwrites a newer drag spot.
  const latestOrderRef = useRef<Map<string, string[]>>(new Map());

  const clearDebounce = useCallback((routeId: string) => {
    const timer = debounceRef.current.get(routeId);
    if (timer) {
      clearTimeout(timer);
      debounceRef.current.delete(routeId);
    }
  }, []);

  const setPreviewOrder = useCallback(
    (routeId: string, orderedTripIds: string[] | null) => {
      clearDebounce(routeId);

      if (!orderedTripIds) {
        latestOrderRef.current.delete(routeId);
        setPreviewState((prev) => {
          const next = new Map(prev);
          next.delete(routeId);
          return next;
        });
        onPreviewChange?.(routeId, null, null);
        return;
      }

      latestOrderRef.current.set(routeId, orderedTripIds);

      // Re-seat the rows IMMEDIATELY (geometry still null) — the reorder
      // preview must feel instant while the pointer is mid-drag, not wait on
      // the polyline fetch.
      setPreviewState((prev) => {
        const next = new Map(prev);
        next.set(routeId, { orderedTripIds, geometry: null });
        return next;
      });
      onPreviewChange?.(routeId, orderedTripIds, null);

      const timer = setTimeout(async () => {
        debounceRef.current.delete(routeId);
        // Superseded by a newer drag position → do nothing.
        if (latestOrderRef.current.get(routeId)?.join(",") !== orderedTripIds.join(",")) {
          return;
        }
        const geometryResult = await getRouteGeometry(routeId, orderedTripIds);
        if (latestOrderRef.current.get(routeId)?.join(",") !== orderedTripIds.join(",")) {
          return;
        }
        setPreviewState((prev) => {
          const next = new Map(prev);
          const existing = next.get(routeId);
          if (!existing || existing.orderedTripIds.join(",") !== orderedTripIds.join(",")) {
            return prev;
          }
          next.set(routeId, {
            orderedTripIds,
            geometry: geometryResult?.geometry ?? null,
          });
          return next;
        });
        onPreviewChange?.(routeId, orderedTripIds, geometryResult?.geometry ?? null);
      }, 150);

      debounceRef.current.set(routeId, timer);
    },
    [clearDebounce, getRouteGeometry, onPreviewChange]
  );

  const startDrag = useCallback((routeId: string, sourceTripId: string) => {
    activeDragRef.current = { routeId, sourceTripId };
  }, []);

  const endDrag = useCallback((routeId: string) => {
    activeDragRef.current = null;
    clearDebounce(routeId);
    latestOrderRef.current.delete(routeId);
    setPreviewState((prev) => {
      const next = new Map(prev);
      next.delete(routeId);
      return next;
    });
    onPreviewChange?.(routeId, null, null);
  }, [clearDebounce, onPreviewChange]);

  const moveItem = useCallback(
    (routeId: string, sourceTripId: string, targetTripId: string) => {
      const orderedTripIds = orderWithMove(
        getStopsForRoute(routeId),
        sourceTripId,
        targetTripId
      );
      if (!orderedTripIds) return;
      setPreviewOrder(routeId, orderedTripIds);
    },
    [getStopsForRoute, setPreviewOrder]
  );

  const clearAll = useCallback(() => {
    for (const timer of debounceRef.current.values()) clearTimeout(timer);
    debounceRef.current.clear();
    activeDragRef.current = null;
    latestOrderRef.current.clear();
    setPreviewState(new Map());
  }, []);

  const getPreviewForRoute = useCallback(
    (routeId: string) => previewState.get(routeId) ?? null,
    [previewState]
  );

  const isPreviewing = useCallback(
    (routeId: string) => previewState.has(routeId),
    [previewState]
  );

  return {
    setPreviewOrder,
    startDrag,
    endDrag,
    moveItem,
    clearAll,
    getPreviewForRoute,
    isPreviewing,
  };
}

/** Pure helper: prospective id order after moving sourceTripId onto
 *  targetTripId's position within one route's stop list. Null = no change. */
export function orderWithMove(
  stops: Array<{ id: string; sequence: number }>,
  sourceTripId: string,
  targetTripId: string
): string[] | null {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const fromIdx = ordered.findIndex((t) => t.id === sourceTripId);
  const toIdx = ordered.findIndex((t) => t.id === targetTripId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return null;

  const reordered = [...ordered];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);
  return reordered.map((t) => t.id);
}