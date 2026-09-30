"use client";

import { useCallback, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Truck, MapPin, AlertTriangle, CheckCircle2, Loader2, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import dynamic from "next/dynamic";
import { ShiftRow } from "./ShiftRow";
import {
  analyzeRoutePlan,
  saveManualGeometryAdjustment,
} from "@/actions/route-analysis.actions";
import type { ViaPoint } from "@/lib/routing/route-analysis.types";
import type { VehicleGroup, ShiftSection } from "./hooks/useVehicleGroups";
import type { GeneratedRouteTrip } from "@/actions/route-generation.actions";
import type { RouteMapStop } from "@/components/facilities/route-map";

const RouteMapView = dynamic(
  () => import("@/components/facilities/route-map").then((m) => m.RouteMapView),
  { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-lg border bg-background" /> }
);

interface VehicleGroupTableProps {
  group: VehicleGroup;
  isEditable: boolean;
  onTimeChange: (tripId: string, newTime: string) => void;
  onFinalize: (routeId: string) => Promise<boolean>;
  onChanged: () => void;
  activeRouteId?: string | null;
  isDragActive: boolean;
  getPreview: (routeId: string) => {
    orderedTripIds: string[];
    geometry: [number, number][] | null;
  } | null;
}

function ShiftTableSection({
  shift,
  vehicleId,
  isEditable,
  onTimeChange,
  previewOrder,
  selectedTripId,
  onSelectTrip,
}: {
  shift: ShiftSection;
  vehicleId: string;
  isEditable: boolean;
  onTimeChange: (tripId: string, newTime: string) => void;
  previewOrder?: string[] | null;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string | null) => void;
}) {
  const trips = useMemo(() => {
    if (!previewOrder) return shift.trips;
    const tripMap = new Map(shift.trips.map((t) => [t.id, t]));
    const ordered = previewOrder
      .map((id) => tripMap.get(id))
      .filter((t): t is GeneratedRouteTrip => t != null);
    // Cross-vehicle preview may carry a dragged-in trip not in this shift;
    // the server result replaces it on refresh — never drop visible rows.
    if (ordered.length === 0) return shift.trips;
    return ordered;
  }, [shift.trips, previewOrder]);

  const isLateNightShift = ["11 PM", "12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"].includes(shift.arrivalTime);

  return (
    <>
      <thead>
        <tr className="border-b bg-accent/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="px-3 py-1.5 font-medium w-8" />
          <th className="px-3 py-1.5 font-medium">Employee</th>
          <th className="px-3 py-1.5 font-medium">Pickup Location</th>
          <th className="px-3 py-1.5 font-medium w-40">Pickup Time</th>
          <th className="px-3 py-1.5 font-medium w-24 text-center" />
          <th className="px-3 py-1.5 font-medium w-20 text-right">Arrival</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {trips.map((trip, index) => (
          <ShiftRow
            key={`${trip.id}:${trip.pickupTime ?? "-"}`}
            trip={trip}
            routeId={shift.route.id}
            vehicleId={vehicleId}
            isEditable={isEditable}
            isFixedArrival={trip.employeeRole === "FIXED_ARRIVAL"}
            isLateNightShift={isLateNightShift}
            arrivalTime={shift.arrivalTime}
            arrivalRowSpan={index === 0 ? trips.length : undefined}
            selected={selectedTripId === trip.id}
            onSelectTrip={onSelectTrip}
            onTimeChange={onTimeChange}
          />
        ))}
        {trips.length === 0 && (
          <tr>
            <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
              No employees assigned to this shift
            </td>
          </tr>
        )}
      </tbody>
    </>
  );
}

function ShiftMapSection({
  shift,
  canAdjust,
  onChanged,
  previewOrder,
  previewGeometry,
  isPreviewing,
  selectedTripId,
  onSelectTrip,
}: {
  shift: ShiftSection;
  canAdjust: boolean;
  onChanged: () => void;
  previewOrder?: string[] | null;
  previewGeometry?: [number, number][] | null;
  isPreviewing?: boolean;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string | null) => void;
}) {
  const trips = useMemo(() => {
    if (!previewOrder) return shift.trips;
    const tripMap = new Map(shift.trips.map((t) => [t.id, t]));
    const ordered = previewOrder
      .map((id) => tripMap.get(id))
      .filter((t): t is GeneratedRouteTrip => t != null);
    if (ordered.length === 0) return shift.trips;
    return ordered;
  }, [shift.trips, previewOrder]);

  const [showMap, setShowMap] = useState(false);

  // ── Adjust-route mode: click the map to drop via points, drag them to
  //    bend the driven path, then Save to persist it on this route. ──
  const [adjustMode, setAdjustMode] = useState(false);
  const [viaPoints, setViaPoints] = useState<ViaPoint[]>([]);
  const [adjustResult, setAdjustResult] = useState<{
    geometry: [number, number][];
    minutes: number;
    km: number;
  } | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const handleMapClickAdjust = useCallback((p: ViaPoint) => {
    setViaPoints((prev) => [...prev, p]);
  }, []);

  const handleViaPointMove = useCallback((idx: number, p: ViaPoint) => {
    setViaPoints((prev) => prev.map((v, i) => (i === idx ? p : v)));
  }, []);

  const handleViaPointRemove = useCallback((idx: number) => {
    setViaPoints((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAdjustReady = useCallback(
    (geometry: [number, number][], totals: { minutes: number; km: number }) => {
      setAdjustResult((prev) =>
        prev &&
        prev.geometry.length === geometry.length &&
        prev.minutes === totals.minutes &&
        prev.km === totals.km
          ? prev
          : { geometry, minutes: totals.minutes, km: totals.km }
      );
    },
    []
  );

  async function beginAdjust() {
    setAdjustMessage(null);
    setShowMap(true);
    // Enter adjust mode FIRST so the user can start dropping / dragging via
    // points immediately. Saving needs a cached route analysis — when the
    // route has none yet, build it on demand in the background. (Previously
    // this branch analyzed + refreshed and then RETURNED, so the mode never
    // opened and the button appeared to do nothing.)
    setAdjustMode(true);
    setViaPoints([]);
    setAdjustResult(null);
    if (!shift.route.routeAnalysis) {
      setAdjustBusy(true);
      try {
        const res = await analyzeRoutePlan(shift.route.id, { force: false });
        if (!res.success) {
          setAdjustMode(false);
          setAdjustMessage({
            tone: "error",
            text: res.error ?? "Could not analyze this route for adjustment.",
          });
        }
      } finally {
        setAdjustBusy(false);
      }
      // Refreshing swaps in the fresh analysis. ShiftBlock is keyed by route id
      // so this section stays mounted and adjust mode survives the reload.
      onChanged();
    }
  }

  function cancelAdjust() {
    setAdjustMode(false);
    setViaPoints([]);
    setAdjustResult(null);
    setAdjustMessage(null);
  }

  async function saveAdjust() {
    if (!adjustResult) return;
    setAdjustBusy(true);
    setAdjustMessage(null);
    try {
      const res = await saveManualGeometryAdjustment(
        shift.route.id,
        adjustResult.geometry,
        viaPoints,
        { minutes: adjustResult.minutes, km: adjustResult.km }
      );
      if (res.success) {
        setAdjustMessage({
          tone: "ok",
          text: "Adjusted route saved — the map now follows your drawn path.",
        });
        setAdjustMode(false);
        setViaPoints([]);
        setAdjustResult(null);
        onChanged();
      } else {
        setAdjustMessage({
          tone: "error",
          text: res.error ?? "Failed to save the adjusted route.",
        });
      }
    } finally {
      setAdjustBusy(false);
    }
  }

  // A previously saved manual adjustment keeps drawing after reload.
  const manualGeometry = useMemo(() => {
    const analysis = shift.route.routeAnalysis;
    if (!analysis || shift.route.appliedCandidateId !== "manual") return null;
    const candidate = analysis.candidates.find((c) => c.id === "manual");
    const g = candidate?.geometry;
    return Array.isArray(g) && g.length >= 2 ? (g as [number, number][]) : null;
  }, [shift.route.routeAnalysis, shift.route.appliedCandidateId]);

  const stops: RouteMapStop[] = useMemo(() => {
    return trips.map((t) => ({
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
  }, [trips]);

  const hasValidCoords = stops.some((s) => s.lat !== 0 && s.lng !== 0);

  if (!hasValidCoords) return null;

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => setShowMap((v) => !v)}
          >
            <MapIcon className="size-3.5" />
            {showMap ? "Hide Route Map" : "Show Route Map"}
          </Button>
          {canAdjust && !adjustMode && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              disabled={adjustBusy}
              onClick={() => void beginAdjust()}
            >
              {adjustBusy ? "Preparing…" : "Adjust route"}
            </Button>
          )}
          {adjustMode && (
            <>
              <Button
                variant="default"
                size="sm"
                className="gap-1 text-xs"
                disabled={adjustBusy || !adjustResult}
                onClick={() => void saveAdjust()}
              >
                {adjustBusy ? "Saving…" : "Save adjustment"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                disabled={adjustBusy}
                onClick={cancelAdjust}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {shift.route.routeType === "PRESET_10PM" ? "Preset" : "Dynamic"} · {shift.route.vehicle?.officeLocation ?? "Office"}
        </span>
      </div>
      {adjustMessage && (
        <p
          className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
            adjustMessage.tone === "ok"
              ? "border-green/40 bg-green/10 text-green"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {adjustMessage.text}
        </p>
      )}
      {showMap && (
        <RouteMapView
          stops={stops}
          destination={shift.route.destination
            ? { lat: shift.route.destination.lat, lng: shift.route.destination.lng, name: shift.route.vehicle?.officeLocation ?? "Office" }
            : null}
          vehicleNumber={shift.route.vehicle?.vehicleNumber ?? null}
          arrivalTime={shift.route.arrivalTime}
          pickupDriveMinutes={shift.route.pickupDriveMinutes ?? null}
          routeKey={shift.route.id}
          // Key the Leaflet container by the COMMITTED trip order only — a
          // saved reorder/move remounts the map on a fresh container (no
          // react-leaflet "Map container is being reused" runtime error);
          // drag-hover previews never touch it, so the map stays stable.
          containerKey={shift.trips.map((t) => t.id).join(",")}
          geometry={manualGeometry}
          previewOrder={previewOrder}
          previewGeometry={previewGeometry ?? null}
          isPreviewing={isPreviewing ?? false}
          selectedTripId={selectedTripId}
          onStopSelect={onSelectTrip}
          adjustMode={adjustMode}
          viaPoints={viaPoints}
          onMapClickAdjust={handleMapClickAdjust}
          onViaPointMove={handleViaPointMove}
          onViaPointRemove={handleViaPointRemove}
          onAdjustReady={handleAdjustReady}
        />
      )}
    </div>
  );
}

function ShiftBlock({
  shift,
  vehicleId,
  isEditable,
  isActiveShift,
  isDragActive,
  onTimeChange,
  onFinalize,
  onChanged,
  preview,
}: {
  shift: ShiftSection;
  vehicleId: string;
  isEditable: boolean;
  isActiveShift: boolean;
  isDragActive: boolean;
  onTimeChange: (tripId: string, newTime: string) => void;
  onFinalize: (routeId: string) => Promise<boolean>;
  onChanged: () => void;
  preview: {
    orderedTripIds: string[];
    geometry: [number, number][] | null;
  } | null;
}) {
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [justFinalized, setJustFinalized] = useState(false);
  const canFinalize = isEditable && (shift.route.status === "DRAFT" || shift.route.status === "UNDER_REVIEW");

  // Success feedback: keep the button on screen through the save + in-place
  // patch (the card flips to FINALIZED right after), so the animation is seen.
  async function handleFinalizeClick() {
    setFinalizing(true);
    const ok = await onFinalize(shift.route.id);
    setFinalizing(false);
    if (ok) {
      setJustFinalized(true);
      window.setTimeout(() => setJustFinalized(false), 2000);
    }
  }

  // Every populated shift is a drop zone: dropping a row here moves the
  // employee onto this vehicle's shift (same day + same arrival enforced
  // server-side; violations surface as a toast, never a silent snap-back).
  const { setNodeRef, isOver } = useDroppable({
    id: `route-${shift.route.id}`,
    data: {
      type: "route",
      routeId: shift.route.id,
      vehicleId,
      arrivalTime: shift.arrivalTime,
    },
    disabled: !isDragActive,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border ${isActiveShift ? "border-teal/50 bg-teal/5" : ""} ${
        isOver ? "border-teal ring-2 ring-teal/50 bg-teal/5" : ""
      }`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 ${
          isActiveShift ? "bg-teal/5" : "bg-accent/30"
        }`}
      >
        <div className="flex-1 flex items-center justify-end gap-2">
          {isOver && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal px-2 py-0.5 text-[10px] font-semibold text-teal-foreground">
              Drop employee here
            </span>
          )}
          {shift.route.status !== "DRAFT" && shift.route.status !== "UNDER_REVIEW" && (
            <Badge variant="outline" className="text-xs">
              <AlertTriangle className="size-2.5 mr-0.5" />
              {shift.route.status}
            </Badge>
          )}
          {(canFinalize || finalizing || justFinalized) && (
            <Button
              variant="default"
              size="sm"
              className={`gap-1 min-w-[96px] transition-all ${
                justFinalized ? "!bg-green-600 hover:!bg-green-600 text-white" : ""
              }`}
              onClick={() => void handleFinalizeClick()}
              disabled={finalizing || justFinalized}
            >
              {finalizing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2
                  className={`size-3.5 ${
                    justFinalized ? "animate-[finalize-pop_.45s_ease-out]" : ""
                  }`}
                />
              )}
              {finalizing ? "Finalizing…" : justFinalized ? "Finalized" : "Finalize"}
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <ShiftTableSection
            shift={shift}
            vehicleId={vehicleId}
            isEditable={isEditable}
            onTimeChange={onTimeChange}
            previewOrder={preview?.orderedTripIds ?? null}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
          />
        </table>
      </div>
      <ShiftMapSection
        shift={shift}
        canAdjust={isEditable}
        onChanged={onChanged}
        previewOrder={preview?.orderedTripIds ?? null}
        previewGeometry={preview?.geometry ?? null}
        isPreviewing={preview != null}
        selectedTripId={selectedTripId}
        onSelectTrip={setSelectedTripId}
      />
    </div>
  );
}

export function VehicleGroupTable({
  group,
  isEditable,
  onTimeChange,
  onFinalize,
  onChanged,
  activeRouteId,
  isDragActive,
  getPreview,
}: VehicleGroupTableProps) {
  const vehicleNumber = group.vehicleNumber ?? "—";
  const vehicleType = group.vehicleType ?? "";
  const capacity = group.capacity ? ` · ${group.capacity} seats` : "";
  const driver = group.driverName ? ` · ${group.driverName}` : "";
  const office = group.officeLocation ?? "Regnum";

  return (
    <Card className={group.isPinnedNotMapped ? "border-dashed border-amber/50 bg-amber/5" : ""}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-teal/10 text-teal">
              <Truck className="size-5" />
            </div>
            <div className="flex flex-col items-start">
              <p className="font-semibold text-lg">{vehicleNumber}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {vehicleType}{capacity}{driver}
                <span className="mx-1">·</span>
                <MapPin className="size-3" />
                {office}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {group.isPinnedNotMapped && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="size-3" />
                Pinned — drop here to map
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {group.isPinnedNotMapped && group.shifts.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-amber/50 p-8 text-center">
            <Truck className="size-12 mx-auto text-amber/50 mb-2" />
            <p className="text-sm text-muted-foreground mb-1">Pinned vehicle — not mapped yet</p>
            <p className="text-xs text-muted-foreground">Drag an employee here to create this route</p>
          </div>
        ) : (
          <div className="space-y-3">
            {group.shifts.map((shift) => (
              <ShiftBlock
                key={shift.route.id}
                shift={shift}
                vehicleId={group.vehicleId}
                isEditable={isEditable}
                isActiveShift={activeRouteId === shift.route.id}
                isDragActive={isDragActive}
                onTimeChange={onTimeChange}
                onFinalize={onFinalize}
                onChanged={onChanged}
                preview={getPreview(shift.route.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
