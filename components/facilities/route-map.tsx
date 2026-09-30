"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useState } from "react";
import { divIcon, type Marker as LeafletMarker } from "leaflet";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMapEvents,
} from "react-leaflet";
import { MapPin, Route as RouteIcon } from "lucide-react";
import { isLateNightArrivalLabel } from "@/lib/constants/route-shifts";

/** A single pickup stop on a route map. */
export interface RouteMapStop {
  /** Stable trip-assignment id — the ONLY key used for ordering/matching. */
  tripId: string;
  lat: number;
  lng: number;
  sequence: number;
  name: string;
  label: string | null;
  time: string | null;
  /** Drive minutes from the previous stop to this one. */
  travelFromPreviousMin: number | null;
  /** Drive minutes from this stop to the office arrival. */
  travelToOfficeMin: number | null;
}

interface RouteMapViewProps {
  stops: RouteMapStop[];
  destination: { lat: number; lng: number; name: string } | null;
  vehicleNumber?: string | null;
  arrivalTime?: string | null;
  /** Optimized drive time from the first pickup to the office arrival. */
  pickupDriveMinutes?: number | null;
  /** Drive time from the office to the first pickup. */
  departureToFirstMinutes?: number | null;
  routeKey?: string | null;
  /** Pre-computed road geometry ([lat, lng][]) from the route analysis —
   * when present the map draws it and skips its own OSRM fetch. */
  geometry?: [number, number][] | null;
  /** Real per-leg drive minutes (leg k = point k → point k+1) — overrides
   * the minutes derived from pickup-time gaps. */
  legMinutesOverride?: number[] | null;
  /** Facing direction per stop (by `sequence`) with the snapped road-side
   * position, from the route analysis. */
  stopHeadings?: StopHeading[] | null;
  /** Dimmed reference path (e.g. the current route while previewing another). */
  ghostGeometry?: [number, number][] | null;
  /** Real driving totals (minutes + km) for the drawn path, supplied by the
   * caller when it provides the geometry (route analysis candidate). Shown
   * in the map footer so routes can be judged at a glance. */
  roadTotals?: { minutes: number; km: number } | null;
  /** Interactive route-adjust mode (Google-Maps style): clicking the map
   * inserts a draggable via point and the path re-routes through it. */
  adjustMode?: boolean;
  /** Via points currently dropped on the route (driven stops → office). */
  viaPoints?: Array<{ lat: number; lng: number }>;
  onMapClickAdjust?: (point: { lat: number; lng: number }) => void;
  onViaPointMove?: (index: number, point: { lat: number; lng: number }) => void;
  onViaPointRemove?: (index: number) => void;
  /** Called with the adjusted road geometry + totals once the via-point route
   * has been re-routed, so the caller can offer a "Save" that persists it. */
  onAdjustReady?: (
    geometry: [number, number][],
    totals: { minutes: number; km: number }
  ) => void;

  /** Preview props for drag-and-drop reordering */
  /** Trip IDs in the prospective order (for drag preview) */
  previewOrder?: string[] | null;
  /** Pre-fetched geometry for the preview order (debounced OSRM result) */
  previewGeometry?: [number, number][] | null;
  /** Whether a drag preview is currently active for this route */
  isPreviewing?: boolean;
  /** Leg minutes for the preview geometry */
  previewLegMinutes?: number[] | null;
  /** Trip currently selected in the table — its marker is highlighted. */
  selectedTripId?: string | null;
  /** Called when a stop marker is clicked (syncs back to the table). */
  onStopSelect?: (tripId: string | null) => void;
  /** Identity of the route's COMMITTED stop order (trip ids). Keys the Leaflet
   *  container div: changes only when the saved order changes — i.e. exactly
   *  when the map must remount on a freshly allocated container. Drag-hover
   *  previews (previewOrder) never change it, so the map stays stable while
   *  rows are dragged and only remounts ONCE after a reorder/move commits.
   *  Without this, react-leaflet re-initializes over a just-release·d DOM node
   *  and Leaflet throws "Map container is being reused by another instance"
   *  (React 19 dev StrictMode surfaces it as a red runtime-error overlay). */
  containerKey?: string | null;
}

/** Which way the vehicle faces when stopped at a pickup, and where on the road. */
export interface StopHeading {
  sequence: number;
  headingDeg: number | null;
  lat: number | null;
  lng: number | null;
}

const ROUTE_COLOR = "#C6F432";
const OFFICE_COLOR = "#22D3EE";
const GHOST_COLOR = "#A1A1AA";
const SELECTED_COLOR = "#F59E0B";

/** Per-shift marker accent so 10 PM / 11 PM / late-night routes are
 *  distinguishable at a glance. The route line itself stays brand lime. */
function shiftAccent(arrivalTime: string | null | undefined): string {
  const norm = (arrivalTime ?? "").toUpperCase().replace(/\s+/g, "");
  if (norm === "10PM") return "#22D3EE";
  if (norm === "11PM") return "#C6F432";
  return "#C084FC";
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** 0..360 → "N" | "NE" | … */
export function compassLabel(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/**
 * Allowed deviation (°) around the map route's initial heading. Under 180 so
 * the opposite carriageway of a divided road is excluded — the vehicle leaves
 * the FIRST pickup facing the SECOND waypoint (drop-off / next pickup)
 * instead of being map-matched to the far side and looping around a divider.
 */
const INITIAL_HEADING_RANGE = 45;

/**
 * Build the OSRM `bearings` value constraining the outgoing heading at EVERY
 * stop to face the NEXT point, leaving the last waypoint (office) free. Under
 * 180 so the opposite carriageway of a divided road is excluded — the vehicle
 * leaves each pickup heading toward the following stop (drop-off / next
 * pickup) instead of being map-matched to the side of the road its lat/lng
 * pin happens to sit on (a right-side pin with a left-side next stop must
 * still depart left). Duplicate consecutive points get no constraint (two
 * riders at the same stop share one visit — a synthetic heading there would
 * be wrong).
 */
function waypointBearingsParam(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  const headings = pts.map((p, i) => {
    const next = pts[i + 1];
    if (!next) return null;
    if (Math.abs(p[0] - next[0]) < 1e-9 && Math.abs(p[1] - next[1]) < 1e-9) {
      return null;
    }
    return bearingDeg(
      { lat: pts[i][0], lng: pts[i][1] },
      { lat: next[0], lng: next[1] }
    );
  });
  const elements = headings.map((heading) => {
    if (heading == null || !Number.isFinite(heading)) return "";
    const h = Math.round(((heading % 360) + 360) % 360);
    return `${h},${INITIAL_HEADING_RANGE}`;
  });
  if (elements.every((el) => el === "")) return "";
  return elements.join(";");
}

/* ── Client-side OSRM road geometry (public demo server, cached per route) ── */

/** Road-geometry result: the polyline plus the real driving totals. */
interface RoadGeometry {
  line: [number, number][];
  /** Total driving distance (km) along the drawn path. */
  totalKm: number | null;
  /** Total driving duration (min) along the drawn path. */
  totalMin: number | null;
}

const geometryCache = new Map<string, Promise<RoadGeometry | null>>();

async function fetchRoadGeometry(
  pts: [number, number][]
): Promise<RoadGeometry | null> {
  const coords = pts
    .map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`)
    .join(";");
  // Full geometry + continue_straight so OSRM returns the true shortest
  // drivable path in the exact waypoint order given (table order). Bearings
  // are NOT applied by default: constraining every stop's heading is what
  // produced the unnatural loops and non-shortest detours.
  const query =
    `?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=true`;

  /** bearings=true runs the constrained request; false is the shortest path. */
  const run = async (withBearings: boolean): Promise<RoadGeometry | null> => {
    const bearings = withBearings ? waypointBearingsParam(pts) : "";
    const url =
      `https://router.project-osrm.org/route/v1/driving/${coords}` +
      `${query}${bearings ? `&bearings=${bearings}` : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code && data.code !== "Ok") return null;
    const route = data?.routes?.[0];
    const g = route?.geometry;
    const raw = Array.isArray(g?.coordinates) ? g.coordinates : null;
    if (!raw || raw.length < 2) return null;
    return {
      line: raw.map((c: number[]) => [Number(c[1]), Number(c[0])]),
      totalKm:
        typeof route?.distance === "number"
          ? route.distance / 1000
          : null,
      totalMin:
        typeof route?.duration === "number" ? route.duration / 60 : null,
    };
  };

  try {
    // Shortest path first — the waypoint order already encodes the pickup
    // sequence, so OSRM must simply connect the dots by road.
    const shortest = await run(false);
    if (shortest) return shortest;
    // No routable shortest path (e.g. divided-road snap) — retry with
    // heading constraints instead of losing the map.
    return await run(true);
  } catch {
    return null;
  }
}

function nearestIndex(geo: [number, number][], p: [number, number]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < geo.length; i++) {
    const d = (geo[i][0] - p[0]) ** 2 + (geo[i][1] - p[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pointAt(
  sub: [number, number][],
  frac: number
): { pos: [number, number]; bearing: number; from: [number, number] } {
  const a = Math.min(sub.length - 1, Math.max(0, Math.round((sub.length - 1) * frac)));
  const pos = sub[a];
  const from = sub[Math.max(0, a - 1)];
  return {
    pos,
    from,
    bearing: bearingDeg(
      { lat: from[0], lng: from[1] },
      { lat: pos[0], lng: pos[1] }
    ),
  };
}

/** Great-circle bearing (degrees clockwise from north) from a → b. */
function bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function stopIcon(displayNumber: number, accent: string, selected: boolean) {
  const ring = selected ? `0 0 0 3px ${SELECTED_COLOR},` : "";
  return divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#0A0A0B;border:2px solid ${accent};color:${accent};font:600 12px/23px system-ui;text-align:center;box-shadow:${ring}0 2px 6px rgba(0,0,0,.55);">${displayNumber}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });
}

function officeIcon() {
  return divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#0A0A0B;border:2px solid ${OFFICE_COLOR};color:${OFFICE_COLOR};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.55);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${OFFICE_COLOR}" stroke-width="1.8" stroke-linecap="round"><path d="M4 21h16M6 21V7l6-4v18M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01"/></svg></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

function arrowIcon(bearingDeg: number) {
  return divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;transform:rotate(${bearingDeg}deg);"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 0l6 12h-4v12h-4V12H6z" fill="${ROUTE_COLOR}" fill-opacity="0.95"/></svg></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Cyan chevron showing the direction the vehicle faces while stopped. */
function facingIcon(headingDeg: number) {
  return divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;transform:rotate(${headingDeg}deg);"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2l7 9h-4.5v11h-5V11H5z" fill="${OFFICE_COLOR}" fill-opacity="0.95" stroke="#0A0A0B" stroke-width="1"/></svg></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function timeChipIcon(minutes: number) {
  return divIcon({
    className: "",
    html: `<div style="padding:2px 7px;border-radius:9999px;background:#0A0A0B;border:1px solid ${ROUTE_COLOR}66;color:${ROUTE_COLOR};font:600 10px/14px system-ui;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.55);">${minutes} min</div>`,
    iconSize: [60, 18],
    iconAnchor: [30, 9],
  });
}

/** Draggable via point that bends the route through it (adjust mode). */
function viaPointIcon() {
  return divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#0A0A0B;border:3px solid #F59E0B;box-shadow:0 0 0 3px rgba(245,158,11,.25),0 2px 8px rgba(0,0,0,.55);"><div style="width:12px;height:12px;margin:6px auto;border-radius:50%;background:#F59E0B;"></div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

/** Map click capture used only in adjust mode (clicking a point on the route
 *  adds a draggable via point there). */
function RouteMapClickCapture({
  onMapClick,
}: {
  onMapClick?: (point: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function RouteMapView({
  stops,
  destination,
  vehicleNumber,
  arrivalTime = null,
  pickupDriveMinutes = null,
  routeKey = null,
  geometry = null,
  legMinutesOverride = null,
  stopHeadings = null,
  ghostGeometry = null,
  roadTotals = null,
  adjustMode = false,
  viaPoints = [],
  onMapClickAdjust,
  onViaPointMove,
  onViaPointRemove,
  onAdjustReady,
  previewOrder = null,
  previewGeometry = null,
  isPreviewing = false,
  previewLegMinutes = null,
  selectedTripId = null,
  onStopSelect,
  containerKey = null,
}: RouteMapViewProps) {
  const baseOrdered = useMemo(
    () => [...stops].sort((a, b) => a.sequence - b.sequence),
    [stops]
  );

  /** Late-night shifts (12 AM – 6 AM) draw pickups → office only: the
   * office → first-pickup empty-run leg is not required on the map (it still
   * exists in the schedule math). 10 PM and 11 PM always draw
   * pickups → office. Shared helper so the server-side analysis
   * and this map never disagree on the topology. */
  const isLateNight = isLateNightArrivalLabel(arrivalTime);
  const accent = shiftAccent(arrivalTime);

  const providedGeometry =
    geometry && geometry.length >= 2 ? geometry : null;

  /** Order stops by trip id — the same ids the table, drag preview, and
   *  server use. Never match by display name (duplicates break it). */
  const ordered = useMemo(() => {
    if (!previewOrder || previewOrder.length === 0) return baseOrdered;
    const byId = new Map(baseOrdered.map((s) => [s.tripId, s]));
    const mapped = previewOrder
      .map((id) => byId.get(id) ?? null)
      .filter((s): s is typeof baseOrdered[0] => s != null);
    // A cross-vehicle preview can reference a trip id this route doesn't
    // have yet — never render an empty map because of it.
    if (mapped.length === 0) return baseOrdered;
    const seen = new Set(mapped.map((s) => s.tripId));
    return [...mapped, ...baseOrdered.filter((s) => !seen.has(s.tripId))];
  }, [baseOrdered, previewOrder]);

  const isPreviewActive = isPreviewing && previewOrder && previewOrder.length > 0;

  /** Only stops with real coordinates take part in routing and markers.
   *  Zero/missing pins are listed separately as unmapped — they must never
   *  consume a stop number or a routing slot (that is what made visible
   *  markers start at 2 / 4 / 7). Display numbers are always 1..n over the
   *  mapped stops in table order. */
  const validOrdered = useMemo(
    () => ordered.filter((s) => s.lat !== 0 || s.lng !== 0),
    [ordered]
  );
  const unmapped = useMemo(
    () => ordered.filter((s) => s.lat === 0 && s.lng === 0),
    [ordered]
  );

  /** Ordered endpoints the vehicle actually drives, expressed as [lat, lng]. */
  const reqPts = useMemo<[number, number][]>(() => {
    const stopPts = validOrdered.map((s) => [s.lat, s.lng] as [number, number]);
    if (!destination) return stopPts;
    return [...stopPts, [destination.lat, destination.lng]];
  }, [validOrdered, destination]);

  /** Drive minutes per leg (leg k = reqPts[k] → reqPts[k+1]). */
  const legTimes = useMemo<number[]>(() => {
    const n = validOrdered.length;
    const t: number[] = [];
    if (n === 0) return t;

    if (isPreviewActive && previewLegMinutes) {
      return previewLegMinutes;
    }

    if (legMinutesOverride) {
      if (legMinutesOverride.length === reqPts.length) {
        return [...legMinutesOverride.slice(1)];
      }
      if (legMinutesOverride.length === reqPts.length - 1) {
        return [...legMinutesOverride];
      }
    }
    for (let i = 1; i < n; i++) t.push(validOrdered[i].travelFromPreviousMin ?? 0);
    t.push(validOrdered[n - 1].travelToOfficeMin ?? 0);
    return t;
  }, [validOrdered, legMinutesOverride, reqPts.length, isPreviewActive, previewLegMinutes]);

  const reqPtsKey = useMemo(
    () => `${isLateNight}|${validOrdered.map((s) => s.tripId).join(",")}|${reqPts.map((p) => p.join(",")).join(";")}`,
    [validOrdered, reqPts, isLateNight]
  );

  /** Road geometry for the current request key. undefined = still routing;
   * null = no routable path. Server-provided geometry (route analysis)
   * bypasses the fetch entirely. */
  const [geoState, setGeoState] = useState<{
    key: string;
    value: RoadGeometry | null;
  } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const cacheKey = useMemo(
    () => `${routeKey ?? "map"}|${reqPtsKey}|retry=${retryNonce}`,
    [routeKey, reqPtsKey, retryNonce]
  );

  const fetchedGeo =
    geoState?.key === cacheKey
      ? geoState.value
      : reqPts.length >= 2
        ? undefined
        : null;

  /** Polyline to draw: preview geometry > server-provided geometry > client OSRM fetch.
   * Late-night provided geometry starts at the office — cut the empty-run leg so the
   * drawn path begins at the first pickup. */
  const firstStopPt: [number, number] | null =
    isLateNight && validOrdered.length > 0 ? [validOrdered[0].lat, validOrdered[0].lng] : null;
  const trimOfficeStart = (g: [number, number][]): [number, number][] => {
    if (!firstStopPt || g.length < 2) return g;
    const cut = nearestIndex(g, firstStopPt);
    return cut > 0 ? g.slice(cut) : g;
  };
  const drawn = useMemo<[number, number][]>(() => {
    if (isPreviewActive && previewGeometry) return trimOfficeStart(previewGeometry);
    if (providedGeometry) return trimOfficeStart(providedGeometry);
    if (fetchedGeo && fetchedGeo.line.length >= 2) return fetchedGeo.line;
    return reqPts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewActive, previewGeometry, providedGeometry, fetchedGeo, reqPts, firstStopPt]);
  const routing = !providedGeometry && !isPreviewActive && fetchedGeo === undefined;

  /** Real driving totals for the footer: caller-supplied totals (route
   * analysis candidate) win; else the fetched route's OSRM distance /
   * duration; else the leg-time sum. */
  const displayTotals = useMemo(() => {
    if (roadTotals) return { km: roadTotals.km, min: roadTotals.minutes };
    if (providedGeometry) return null;
    if (fetchedGeo && fetchedGeo.line.length >= 2) {
      return { km: fetchedGeo.totalKm, min: fetchedGeo.totalMin };
    }
    return null;
  }, [roadTotals, providedGeometry, fetchedGeo]);

  useEffect(() => {
    if (reqPts.length < 2 || providedGeometry) return;
    let cancelled = false;
    let promise = geometryCache.get(cacheKey);
    if (!promise) {
      promise = fetchRoadGeometry(reqPts);
      geometryCache.set(cacheKey, promise);
    }
    promise.then((res) => {
      if (!cancelled) setGeoState({ key: cacheKey, value: res });
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, reqPts, providedGeometry]);

  /** Adjusted path while in adjust mode: the stored stops plus the dropped via
   *  points routed through the public OSRM server (cached per stop+via set). */
  const [adjustDrawn, setAdjustDrawn] = useState<[number, number][] | null>(null);
  const [adjustDrawnKey, setAdjustDrawnKey] = useState("");
  const [adjustTotals, setAdjustTotals] = useState<{
    minutes: number;
    km: number;
  } | null>(null);

  const adjustKey = useMemo(
    () =>
      adjustMode
        ? `${reqPtsKey}|via=${viaPoints.map((v) => v.lat.toFixed(5) + "," + v.lng.toFixed(5)).join(";")}`
        : "",
    [adjustMode, reqPtsKey, viaPoints]
  );

  useEffect(() => {
    if (!adjustMode) return;
    const stops = validOrdered.map((s) => [s.lat, s.lng] as [number, number]);
    const office = destination
      ? [[destination.lat, destination.lng] as [number, number]]
      : [];
    const vias = viaPoints.map((v) => [v.lat, v.lng] as [number, number]);
    const allPts = [...stops, ...vias, ...office];
    if (allPts.length < 2) return;
    let cancelled = false;
    const promise =
      geometryCache.get(adjustKey) ?? fetchRoadGeometry(allPts);
    geometryCache.set(adjustKey, promise);
    promise.then((res) => {
      if (cancelled) return;
      const line: [number, number][] =
        res && res.line.length >= 2 ? res.line : allPts;
      const totals = {
        minutes: Math.round(res?.totalMin ?? 0),
        km: Number((res?.totalKm ?? 0).toFixed(2)),
      };
      setAdjustDrawn(line);
      setAdjustDrawnKey(adjustKey);
      setAdjustTotals(totals);
      onAdjustReady?.(line, totals);
    });
    return () => {
      cancelled = true;
    };
  }, [adjustMode, adjustKey, validOrdered, destination, viaPoints, onAdjustReady]);

  /** While dropping/dragging adjust via points, draw the adjusted path
   *  exclusively (the stored candidate geometry is bypassed). Until the
   *  re-route resolves the old path is stale. */
  const adjusting = adjustMode;
  const adjustStale = adjustMode && adjustDrawnKey !== adjustKey;
  const shownLine: [number, number][] =
    adjustMode && !adjustStale && adjustDrawn && adjustDrawn.length >= 2
      ? adjustDrawn
      : drawn;

  const headingBySequence = useMemo(() => {
    const m = new Map<number, StopHeading>();
    for (const h of stopHeadings ?? []) {
      if (h.headingDeg != null) m.set(h.sequence, h);
    }
    return m;
  }, [stopHeadings]);

  /** Split the drawn path into per-leg sub-paths at the pickup/office points. */
  const legs = useMemo(() => {
    if (drawn.length < 2 || reqPts.length < 2) return [];
    const idxs = reqPts.map((p) => nearestIndex(drawn, p));
    for (let i = 1; i < idxs.length; i++) {
      idxs[i] = Math.max(idxs[i], idxs[i - 1]);
    }
    const out: [number, number][][] = [];
    for (let k = 0; k < reqPts.length - 1; k++) {
      const sub = drawn.slice(idxs[k], idxs[k + 1] + 1);
      out.push(sub.length >= 1 ? sub : [reqPts[k], reqPts[k + 1]]);
    }
    return out;
  }, [drawn, reqPts]);

  const bounds = useMemo(() => {
    const pts: [number, number][] = validOrdered.map((s) => [s.lat, s.lng]);
    if (destination) pts.push([destination.lat, destination.lng]);
    if (pts.length === 0) return null;
    return pts;
  }, [validOrdered, destination]);

  return (
    <div className="space-y-2">
      {bounds ? (
        <div key={containerKey ?? routeKey ?? "map"} className="h-96 w-full overflow-hidden rounded-lg border bg-[#0A0A0B]">
          <MapContainer
            center={bounds[0]}
            zoom={13}
            bounds={bounds}
            className="h-full w-full"
            scrollWheelZoom={false}
            zoomControl
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
            />
            {adjustMode ? (
              <RouteMapClickCapture onMapClick={onMapClickAdjust} />
            ) : null}
            {ghostGeometry && ghostGeometry.length >= 2 && !adjusting ? (
              <Polyline
                positions={trimOfficeStart(ghostGeometry)}
                pathOptions={{
                  color: GHOST_COLOR,
                  weight: 3,
                  opacity: 0.55,
                  dashArray: "6 8",
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            ) : null}

            {shownLine.length >= 2 ? (
              <Polyline
                positions={shownLine}
                pathOptions={{
                  color: adjusting ? "#F59E0B" : ROUTE_COLOR,
                  weight: adjusting ? 5 : 4,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            ) : null}

            {adjusting
              ? null
              : legs.map((sub, k) => {
                  if (sub.length < 2) return null;
                  const arrow = pointAt(sub, 0.42);
                  return (
                    <Marker
                      key={`arrow-${k}`}
                      position={arrow.pos}
                      icon={arrowIcon(arrow.bearing)}
                    />
                  );
                })}

            {adjusting
              ? null
              : legs.map((sub, k) => {
                  const minutes = legTimes[k];
                  if (sub.length < 2 || minutes == null || minutes <= 0)
                    return null;
                  const mid = pointAt(sub, 0.5);
                  return (
                    <Marker
                      key={`chip-${k}`}
                      position={mid.pos}
                      icon={timeChipIcon(Math.round(minutes))}
                      interactive={false}
                    />
                  );
                })}

            {(routing && !adjusting) || (adjusting && adjustStale) ? (
              <Marker
                position={segStart(reqPts)}
                icon={divIcon({
                  className: "",
                  html: `<div style="padding:3px 8px;border-radius:9999px;background:#0A0A0B;border:1px solid #22D3EE66;color:#22D3EE;font:600 10px/14px system-ui;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.55);">Re-routing…</div>`,
                  iconSize: [84, 20],
                  iconAnchor: [42, 10],
                })}
                interactive={false}
              />
            ) : null}

            {adjusting
              ? viaPoints.map((v, idx) => (
                  <Marker
                    key={`via-${idx}`}
                    position={[v.lat, v.lng]}
                    icon={viaPointIcon()}
                    draggable
                    zIndexOffset={500}
                    eventHandlers={{
                      dragend: (e) => {
                        const pos = (e.target as LeafletMarker).getLatLng();
                        onViaPointMove?.(idx, { lat: pos.lat, lng: pos.lng });
                      },
                    }}
                  >
                    <Popup>
                      <span style={{ display: "block", fontWeight: 600 }}>
                        Via point {idx + 1}
                      </span>
                      <span style={{ display: "block", color: "#A1A1AA" }}>
                        Drag it to bend the route.
                      </span>
                      <button
                        type="button"
                        onClick={() => onViaPointRemove?.(idx)}
                        style={{
                          marginTop: 8,
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid #A1A1AA55",
                          background: "#0A0A0B",
                          color: "#F87171",
                          cursor: "pointer",
                        }}
                      >
                        Remove via point
                      </button>
                    </Popup>
                  </Marker>
                ))
              : null}

            {validOrdered.map((s) => {
              const h = headingBySequence.get(s.sequence);
              if (!h || h.headingDeg == null) return null;
              const pos: [number, number] =
                h.lat != null && h.lng != null ? [h.lat, h.lng] : [s.lat, s.lng];
              return (
                <Marker
                  key={`facing-${s.tripId}`}
                  position={pos}
                  icon={facingIcon(h.headingDeg)}
                  interactive={false}
                  zIndexOffset={-100}
                />
              );
            })}

            {validOrdered.map((s, idx) => {
              const h = headingBySequence.get(s.sequence);
              return (
                <Marker
                  key={`stop-${s.tripId}`}
                  position={[s.lat, s.lng]}
                  icon={stopIcon(idx + 1, accent, selectedTripId === s.tripId)}
                  eventHandlers={{
                    click: () => onStopSelect?.(s.tripId),
                  }}
                >
                  <Popup>
                    <strong>
                      Stop {idx + 1}: {s.name}
                    </strong>
                    {s.label ? <span style={{ display: "block" }}>{s.label}</span> : null}
                    {s.time ? (
                      <span style={{ display: "block", color: "#A1A1AA" }}>
                        Pick-up {s.time}
                        {s.travelToOfficeMin != null
                          ? ` · ${Math.round(s.travelToOfficeMin)} min to office`
                          : ""}
                      </span>
                    ) : null}
                    {h && h.headingDeg != null ? (
                      <span style={{ display: "block", color: OFFICE_COLOR }}>
                        Stop facing {compassLabel(h.headingDeg)} ({Math.round(h.headingDeg)}°)
                      </span>
                    ) : null}
                  </Popup>
                </Marker>
              );
            })}
            {destination && (
              <Marker
                position={[destination.lat, destination.lng]}
                icon={officeIcon()}
              >
                <Popup>
                  <strong>{destination.name}</strong>
                  <span style={{ display: "block", color: "#A1A1AA" }}>
                    Office — final drop
                  </span>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <MapPin className="size-4" />
          Pickup coordinates are missing for {vehicleNumber ?? "this route"} — the
          map cannot be drawn until the pickup points are geocoded.
        </div>
      )}

      {unmapped.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
          {unmapped.length} stop{unmapped.length > 1 ? "s" : ""} ha{unmapped.length > 1 ? "ve" : "s"} no
          pickup coordinates and {unmapped.length > 1 ? "are" : "is"} not drawn:{" "}
          {unmapped.map((s) => s.name).join(", ")}. Geocode the pickup point to
          include {unmapped.length > 1 ? "them" : "it"} in the route.
        </div>
      )}
      {fetchedGeo === null && reqPts.length >= 2 && !providedGeometry && !isPreviewActive && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <span className="text-amber-600">
            Road routing failed for this stop order — showing straight waypoint
            connections. Check pickup coordinates, then retry.
          </span>
          <button
            type="button"
            className="rounded-md border border-amber-500/40 px-2 py-1 font-medium text-amber-600 hover:bg-amber-500/10"
            onClick={() => {
              setGeoState(null);
              setRetryNonce((n) => n + 1);
            }}
          >
            Retry routing
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {adjusting ? (
          <span className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600">
            Adjust mode — click the route to add a via point, drag it to bend
            the path
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-5 rounded-full"
            style={{ background: adjusting ? "#F59E0B" : ROUTE_COLOR }}
          />
          {validOrdered.length === 0
            ? "Pickup order —"
            : adjusting
              ? "Adjusted path"
              : "Pickups → office · stop numbers match table rows"}
        </span>
        <span className="flex items-center gap-1.5">
          <RouteIcon className="size-3.5" />
          {pickupDriveMinutes != null
            ? `Pickup drive ≈ ${Math.round(pickupDriveMinutes)} min`
            : null}
        </span>
        {adjusting && adjustTotals && !adjustStale ? (
          <span className="flex items-center gap-1.5 tabular-nums">
            <RouteIcon className="size-3.5" />
            Adjusted road: {Math.round(adjustTotals.minutes)} min ·{" "}
            {adjustTotals.km.toFixed(1)} km
          </span>
        ) : displayTotals ? (
          <span className="flex items-center gap-1.5 tabular-nums">
            <RouteIcon className="size-3.5" />
            {displayTotals.km != null && displayTotals.min != null
              ? `Road: ${Math.round(displayTotals.min)} min · ${displayTotals.km.toFixed(1)} km`
              : displayTotals.km != null
                ? `Road: ${displayTotals.km.toFixed(1)} km`
                : `Road: ${Math.round(displayTotals.min as number)} min`}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: OFFICE_COLOR }}
          />
          {destination?.name ?? "Office"}
        </span>
        {adjusting ? (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full border-2"
              style={{ borderColor: "#F59E0B" }}
            />
            Via points
          </span>
        ) : null}
        {headingBySequence.size > 0 ? (
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 2l7 9h-4.5v11h-5V11H5z" fill={OFFICE_COLOR} />
            </svg>
            Direction the vehicle faces at each stop
          </span>
        ) : null}
        {ghostGeometry && ghostGeometry.length >= 2 ? (
          <span className="flex items-center gap-1.5">
            <span
              className="h-0 w-5 border-t-2 border-dashed"
              style={{ borderColor: GHOST_COLOR }}
            />
            Current route
          </span>
        ) : null}
        {isPreviewActive && (
          <span className="flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 font-medium text-teal text-xs">
            <span className="size-1.5 rounded-full bg-teal animate-pulse" />
            Preview: drag reorder
          </span>
        )}
        {vehicleNumber && <span className="ml-auto">{vehicleNumber}</span>}
      </div>
    </div>
  );
}

function segStart(pts: [number, number][]): [number, number] {
  const a = pts[0];
  const b = pts[Math.min(1, pts.length - 1)];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}