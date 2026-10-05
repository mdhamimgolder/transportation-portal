"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  defaultKeyboardCoordinateGetter,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import { AlertCircle, CheckCircle2, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useVehicleGroups } from "./hooks/useVehicleGroups";
import { useDragActions } from "./hooks/useDragActions";
import { useDragPreview, orderWithMove } from "./hooks/useDragPreview";
import { VehicleGroupTable } from "./VehicleGroupTable";
import { EmptyVehicleDropZone } from "./EmptyVehicleDropZone";
import { CustomDragOverlay } from "./DragOverlay";
import type { GeneratedRouteDetail, GeneratedRouteTrip } from "@/actions/route-generation.actions";

interface RouteBreakdownProps {
  routes: GeneratedRouteDetail[];
  activeRouteId?: string | null;
  onRouteSelect?: (routeId: string) => void;
  onRefresh: () => void;
  /** Full, visible reload (used by the manual Refresh button). */
  isLoading?: boolean;
  /** Silent refresh — swaps fresh data in with NO loading skeleton (used after
   *  drags/moves that touch more than one route). */
  onChanged?: () => void;
  /** In-place patch of a single updated route card (no reload at all). */
  onRouteUpdated?: (updated: GeneratedRouteDetail) => void;
}

export function RouteBreakdown({
  routes,
  activeRouteId,
  onRefresh,
  isLoading,
  onChanged,
  onRouteUpdated,
}: RouteBreakdownProps) {
  const vehicleGroups = useVehicleGroups(routes);

  const [activeDrag, setActiveDrag] = useState<{
    tripId: string;
    routeId: string;
    employeeName: string;
  } | null>(null);

  const [busyAction, setBusyAction] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const { toast } = useToast();

  const getStopsForRoute = useCallback(
    (routeId: string) => {
      const route = routes.find((r) => r.id === routeId);
      if (!route) return [];
      return route.trips.map((t) => ({ id: t.id, sequence: t.sequenceInTrip }));
    },
    [routes]
  );

  const getRouteGeometry = useCallback(
    async (routeId: string, orderedTripIds: string[]) => {
      const route = routes.find((r) => r.id === routeId);
      if (!route) return null;

      const tripMap = new Map(route.trips.map((t) => [t.id, t]));
      const orderedTrips = orderedTripIds
        .map((id) => tripMap.get(id))
        .filter((t): t is GeneratedRouteTrip => t != null);

      const stops = orderedTrips.map((t) => ({
        tripId: t.id,
        lat: t.pickupLat ?? 0,
        lng: t.pickupLng ?? 0,
        sequence: t.sequenceInTrip,
        name: t.pickupLocationLabel ?? t.employeeName,
        label: t.pickupType === "PRESET_POINT" ? "Preset Point" : "Home Address",
        time: t.pickupTime,
        travelFromPreviousMin: t.travelFromPreviousMin,
        travelToOfficeMin: t.travelToOfficeMin,
      }));

      if (stops.some((s) => s.lat === 0 && s.lng === 0)) {
        return null;
      }

      try {
        const destination = route.destination;
        const points: [number, number][] = stops.map((stop) => [stop.lat, stop.lng]);
        if (destination) points.push([destination.lat, destination.lng]);
        const params = new URLSearchParams({
          points: JSON.stringify(points),
          overview: "simplified",
        });
        const res = await fetch(`/api/routing/route?${params}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data?.line) || data.line.length < 2) return null;
        return { geometry: data.line, legMinutes: data.legMinutes ?? [] };
      } catch {
        return null;
      }
    },
    [routes]
  );

  const { handleReorder, handleMove, handleAdjustTime, handleFinalize } = useDragActions({
    onRouteUpdated: (updated) => onRouteUpdated?.(updated),
    onChanged: onChanged ?? onRefresh,
    onError: (msg) => {
      setLastError(msg);
      toast({ title: "Move failed", description: msg, variant: "destructive" });
    },
    onSuccess: (msg) => {
      setLastError(null);
      toast({ title: "Route updated", description: msg });
    },
  });

  // Wrapper for drops onto pinned-but-unused vehicle cards.
  const handleMoveToUnusedVehicle = useCallback(
    (tripId: string, targetVehicleId: string) => {
      handleMove(tripId, "", true, { targetVehicleId });
    },
    [handleMove]
  );

  const {
    startDrag,
    endDrag,
    moveItem,
    clearAll,
    getPreviewForRoute,
  } = useDragPreview({
    getStopsForRoute,
    getRouteGeometry,
    onPreviewChange: () => {},
  });

  const getPreview = useCallback(
    (routeId: string) => getPreviewForRoute(routeId),
    [getPreviewForRoute]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: defaultKeyboardCoordinateGetter,
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const tripId = active.id as string;
      const routeId = active.data?.current?.routeId as string | undefined;

      const trip = routes.flatMap((r) => r.trips).find((t) => t.id === tripId);
      if (trip && routeId) {
        setActiveDrag({
          tripId,
          routeId,
          employeeName: trip.employeeName,
        });
        startDrag(routeId, tripId);
      }
    },
    [routes, startDrag]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const data = (active.data?.current ?? {}) as {
        tripId?: string;
        routeId?: string;
        arrivalTime?: string;
      };
      const rawId = active.id as string;
      const tripId = data.tripId ?? (rawId.startsWith("trip-") ? rawId.slice(5) : rawId);
      const sourceRouteId = data.routeId ?? null;
      const sourceRoute = sourceRouteId ? routes.find((r) => r.id === sourceRouteId) : undefined;

      const finish = () => {
        if (sourceRouteId) endDrag(sourceRouteId);
        else clearAll();
        setActiveDrag(null);
      };

      if (!sourceRoute || busyAction) {
        finish();
        return;
      }

      // Released over open space (a gap between rows / edge of the table): dnd-kit
      // reports over === null. If this drag had already previewed a position in
      // the shift, honor it rather than snapping the rows back.
      if (!over) {
        const previewed = getPreview(sourceRoute.id)?.orderedTripIds ?? null;
        if (previewed) {
          setBusyAction(true);
          try {
            await handleReorder(sourceRoute.id, previewed);
          } finally {
            setBusyAction(false);
            finish();
          }
        } else {
          finish();
        }
        return;
      }

      const targetId = over.id as string;
      setBusyAction(true);
      try {
        if (targetId.startsWith("trip-")) {
          const targetTripId = targetId.slice(5);
          const targetRoute = routes.find((r) => r.trips.some((t) => t.id === targetTripId));
          if (!targetRoute) return;
          if (targetRoute.id === sourceRoute.id) {
            // Find the order the user last arranged this shift's rows into.
            // NOTE: during the live preview the dragged row is re-seated at the
            // drop position, so the row under the pointer at release is often
            // the dragged row ITSELF (targetTripId === tripId). Dropping on the
            // dragged row must NOT be treated as "no move" — commit whatever
            // order is on screen, exactly like the drag preview showed it.
            let ordered: string[] | null = null;
            if (targetTripId === tripId) {
              ordered = getPreview(sourceRoute.id)?.orderedTripIds ?? null;
            } else {
              ordered = orderWithMove(
                getStopsForRoute(sourceRoute.id),
                tripId,
                targetTripId
              );
            }
            if (!ordered) return;
            // A manual reorder is honored on every route type, including
            // PRESET_10PM — the server treats a cross-point drag as an override
            // and re-times the new order so pickup times stay monotonic.
            await handleReorder(sourceRoute.id, ordered);
          } else {
            // Another vehicle's row: same day + same arrival enforced below
            // and server-side; violations surface as a toast.
            if (targetRoute.arrivalTime !== sourceRoute.arrivalTime) {
              const msg = `Rows can only move between ${sourceRoute.arrivalTime} vehicles — not to ${targetRoute.arrivalTime}.`;
              setLastError(msg);
              toast({ title: "Move not allowed", description: msg, variant: "destructive" });
              return;
            }
            // Land the rider at the exact dropped position (before that row).
            await handleMove(tripId, targetRoute.id, false, { insertBeforeTripId: targetTripId });
          }
        } else if (targetId.startsWith("route-")) {
          const targetRouteId = targetId.replace("route-", "");
          if (targetRouteId === sourceRoute.id) return;
          const targetRoute = routes.find((r) => r.id === targetRouteId);
          if (!targetRoute) return;
          if (targetRoute.arrivalTime !== sourceRoute.arrivalTime) {
            const msg = `Rows can only move between ${sourceRoute.arrivalTime} vehicles — not to ${targetRoute.arrivalTime}.`;
            setLastError(msg);
            toast({ title: "Move not allowed", description: msg, variant: "destructive" });
            return;
          }
          await handleMove(tripId, targetRouteId, false);
        } else if (targetId.startsWith("vehicle-")) {
          const targetVehicleId = targetId.replace("vehicle-", "");
          const group = vehicleGroups.find((g) => g.vehicleId === targetVehicleId);
          if (!group) return;
          if (group.vehicleId === sourceRoute.vehicleId) return;
          const matching = group.shifts.find((s) => s.arrivalTime === sourceRoute.arrivalTime);
          if (group.isPinnedNotMapped && group.shifts.length === 0 && group.pinnedVehicleId) {
            await handleMove(tripId, "", true, { targetVehicleId: group.pinnedVehicleId });
          } else if (!matching) {
            const msg = `That vehicle has no ${sourceRoute.arrivalTime} shift — rows only move within the same arrival time.`;
            setLastError(msg);
            toast({ title: "Move not allowed", description: msg, variant: "destructive" });
            return;
          } else {
            await handleMove(tripId, matching.route.id, false);
          }
        }
      } finally {
        setBusyAction(false);
        finish();
      }
    },
    [routes, vehicleGroups, busyAction, getStopsForRoute, getPreview, handleMove, handleReorder, endDrag, clearAll, toast]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const data = (active.data?.current ?? {}) as {
        tripId?: string;
        routeId?: string;
      };
      const rawId = active.id as string;
      const sourceTripId = data.tripId ?? (rawId.startsWith("trip-") ? rawId.slice(5) : rawId);
      const sourceRouteId = data.routeId;
      const targetId = over.id as string;
      // Live reorder preview only within the dragged row's own shift.
      if (sourceRouteId && targetId.startsWith("trip-")) {
        const targetTripId = targetId.slice(5);
        const targetRoute = routes.find((r) => r.trips.some((t) => t.id === targetTripId));
        if (targetRoute && targetRoute.id === sourceRouteId) {
          moveItem(sourceRouteId, sourceTripId, targetTripId);
        }
      }
    },
    [routes, moveItem]
  );

  const flattenedGroups = useMemo(() => {
    return vehicleGroups.map((group) => ({
      vehicleId: group.vehicleId,
      vehicleNumber: group.vehicleNumber,
      shifts: group.shifts.map((s) => ({ routeId: s.route.id })),
    }));
  }, [vehicleGroups]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-20" />
          </Card>
        ))}
      </div>
    );
  }

  if (vehicleGroups.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Truck className="size-6 text-muted-foreground/50" />
          No routes generated for this day. Run mapping to generate routes.
        </CardContent>
      </Card>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
    >
      <div className="space-y-4">
        <CustomDragOverlay activeDrag={activeDrag} vehicleGroups={flattenedGroups} />

        {lastError && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              {lastError}
            </span>
            <button
              type="button"
              onClick={() => setLastError(null)}
              className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}

        {vehicleGroups.map((group) => (
          <VehicleGroupTable
            key={group.vehicleId}
            group={group}
            isEditable={group.shifts.some((s) =>
              s.route.status === "DRAFT" || s.route.status === "UNDER_REVIEW"
            )}
            onTimeChange={handleAdjustTime}
            onFinalize={handleFinalize}
            onChanged={onChanged ?? onRefresh}
            activeRouteId={activeRouteId}
            isDragActive={activeDrag != null && !busyAction}
            getPreview={getPreview}
          />
        ))}

        {vehicleGroups.some((g) => g.isPinnedNotMapped && g.shifts.length === 0) && (
          <div className="space-y-3">
            {vehicleGroups
              .filter((g) => g.isPinnedNotMapped && g.shifts.length === 0)
              .map((group) => (
                <EmptyVehicleDropZone
                  key={group.vehicleId}
                  group={group}
                  isDragActive={activeDrag != null}
                  onDrop={(tripId) => handleMoveToUnusedVehicle(tripId, group.pinnedVehicleId!)}
                />
              ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-1 size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Routes
          </Button>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-teal" />
              Active route highlighted
            </span>
            <span className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5 text-amber" />
              Fixed arrival = black text
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-green" />
              Drag to reorder / move
            </span>
          </div>
        </div>
      </div>
    </DndContext>
  );
}