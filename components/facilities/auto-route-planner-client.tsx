"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarRange,
  BusFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Map,
  MapPin,
  PackageOpen,
  Play,
  RefreshCw,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  generateWeeklyRoutes,
  getWeekRouteOverview,
  getGeneratedRouteDetails,
  type GenerateRoutesResult,
  type WeekRouteOverview,
  type GeneratedRouteDay,
  type GeneratedRouteDetail,
} from "@/actions/route-generation.actions";
import {
  getRouteLearningStats,
  type RouteLearningStats,
} from "@/actions/route-learning.actions";
import { DAY_LABELS, formatShortDate, getMondayOfWeek } from "@/lib/date/week";

/** Client-only lazy load: Leaflet needs `window`, which is absent during SSR. */
const RouteMapView = dynamic(
  () =>
    import("@/components/facilities/route-map").then((m) => m.RouteMapView),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 animate-pulse rounded-lg border bg-background" />
    ),
  }
);

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

type Props = {
  initialWeekStart: string;
  initialOverview: WeekRouteOverview;
};

export function AutoRoutePlannerClient({ initialWeekStart, initialOverview }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(
    () => new Date(`${initialWeekStart}T00:00:00`)
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GenerateRoutesResult | null>(null);
  const [overview, setOverview] = useState<WeekRouteOverview>(initialOverview);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [routesDetail, setRoutesDetail] = useState<GeneratedRouteDay[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(0);
  const [learningStats, setLearningStats] = useState<RouteLearningStats | null>(null);

  const refreshOverview = useCallback(async (week: Date) => {
    setOverviewLoading(true);
    try {
      const next = await getWeekRouteOverview(toISODate(week));
      setOverview(next);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (week: Date) => {
    try {
      const days = await getGeneratedRouteDetails(toISODate(week));
      setRoutesDetail(days);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetails = useCallback(async (week: Date) => {
    setDetailLoading(true);
    await loadDetails(week);
  }, [loadDetails]);

  useEffect(() => {
    void loadDetails(weekStart);
  }, [weekStart, loadDetails]);

  useEffect(() => {
    getRouteLearningStats()
      .then((s) => setLearningStats(s))
      .catch(() => setLearningStats(null));
  }, []);

  function shiftWeek(days: number) {
    const next = getMondayOfWeek(new Date(weekStart.getTime() + days * 24 * 60 * 60 * 1000));
    setWeekStart(next);
    setResult(null);
    void refreshOverview(next);
  }

  async function runMapping() {
    setRunning(true);
    setResult(null);
    try {
      const res = await generateWeeklyRoutes(toISODate(weekStart));
      setResult(res);
      // Learning runs server-side inside generateWeeklyRoutes — refresh the
      // Route memory card with the freshly rebuilt learned set.
      getRouteLearningStats()
        .then((s) => setLearningStats(s))
        .catch(() => setLearningStats(null));
      void refreshOverview(weekStart);
      void refreshDetails(weekStart);
    } finally {
      setRunning(false);
    }
  }

  async function recheck() {
    setRefreshing(true);
    try {
      await Promise.all([refreshOverview(weekStart), refreshDetails(weekStart)]);
      setResult(null);
    } finally {
      setRefreshing(false);
    }
  }

  const totalApproved = overview.reduce((sum, d) => sum + d.approvedEmployees, 0);
  const totalRoutes = overview.reduce((sum, d) => sum + d.routesGenerated, 0);

  const resultStatus = result
    ? result.success
      ? "success"
      : result.summary.totalErrors > 0 && result.summary.routesGenerated10PM + result.summary.routesGenerated11PM + result.summary.routesGenerated12AMPlus > 0
        ? "partial"
        : "failed"
    : null;

  return (
    <div className="space-y-6">
      {/* ── Week picker + RUN MAPPING ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="size-4 text-teal" />
            Week to map
          </CardTitle>
          <CardDescription>
            Routes are generated for all five working days of the selected week
            (10 PM, 11 PM and 12 AM-6 AM shifts).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous week"
                onClick={() => shiftWeek(-7)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {weekStart.toLocaleDateString(undefined, {
                    year: "numeric",
                  })}{" "}
                  — {formatShortDate(weekStart)}
                </span>
                <Input
                  type="date"
                  aria-label="Week start date"
                  value={toISODate(weekStart)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const next = getMondayOfWeek(new Date(`${e.target.value}T00:00:00`));
                    setWeekStart(next);
                    setResult(null);
                    void refreshOverview(next);
                  }}
                  className="w-44"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next week"
                onClick={() => shiftWeek(7)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="lg"
                className="gap-2"
                disabled={running}
                onClick={runMapping}
              >
                {running ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {running ? "Mapping week…" : "RUN MAPPING"}
              </Button>
              <Link href="/facilities/route-planning">
                <Button type="button" variant="outline" size="lg" className="gap-2">
                  Review generated routes
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>

          {running && (
            <p className="mt-4 flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-teal-foreground">
              <RefreshCw className="size-4 animate-spin" />
              Refreshing route memory from history, then generating 10 PM →
              11 PM → 12 AM-6 AM routes for all 5 days via OSRM. This can take
              a minute on a public server.
            </p>
          )}

          {/* ── Route memory: learned pickup gaps from history ─────── */}
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Brain className="size-4 text-teal" />
                <span className="font-medium">Route memory</span>
                {learningStats && learningStats.legCount > 0 ? (
                  <span className="text-muted-foreground">
                    {learningStats.confidentLegs} trusted legs ·{" "}
                    {learningStats.legCount} total ·{" "}
                    {learningStats.observationCount} past pickups used
                    {learningStats.lastTrainedAt
                      ? ` · last trained ${new Date(
                          learningStats.lastTrainedAt
                        ).toLocaleDateString()}`
                      : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Not trained yet — runs automatically on your next mapping
                  </span>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                Automatic — no button needed
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Every RUN MAPPING first mines all past route plans for the real
              pickup-to-pickup gaps Facilities tuned day by day, then plans with
              them. Confident legs (3+ observations) replace the 5 min/km
              estimate.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Mapping result ────────────────────────────────────── */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {resultStatus === "success" ? (
                <CheckCircle2 className="size-4 text-green" />
              ) : (
                <AlertTriangle className="size-4 text-destructive" />
              )}
              Mapping result — Week of {formatShortDate(new Date(weekStart))}
            </CardTitle>
            <CardDescription>
              {resultStatus === "success" &&
                "All shifts generated cleanly. Draft routes are ready to review."}
              {resultStatus === "partial" &&
                "Routes were created but some entries had problems — review the errors below."}
              {resultStatus === "failed" &&
                "No routes were created. Check the errors below and the Route Setting / address data."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <ResultStat
                label="10 PM routes"
                value={result.summary.routesGenerated10PM}
              />
              <ResultStat
                label="11 PM routes"
                value={result.summary.routesGenerated11PM}
              />
              <ResultStat
                label="12 AM-6 AM routes"
                value={result.summary.routesGenerated12AMPlus}
              />
              <ResultStat
                label="Errors"
                value={result.summary.totalErrors}
                tone={result.summary.totalErrors > 0 ? "danger" : "ok"}
              />
            </div>

            {result.learning && !result.learning.success && (
              <p className="mt-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber-foreground">
                Route memory refresh failed this run — the planner fell back to
                the 5 min/km estimate. {result.learning.error}
              </p>
            )}

            {result.summary.totalErrors > 0 && (
              <div className="mt-4 space-y-2">
                {(["errors10PM", "errors11PM", "errors12AMPlus"] as const).map(
                  (key) => {
                    const errors = result.details[key];
                    if (errors.length === 0) return null;
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                      >
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                          {key.replace("errors", "") || "Errors"}
                        </p>
                        <ul className="list-disc pl-5 text-xs text-muted-foreground">
                          {errors.slice(0, 12).map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                          {errors.length > 12 && (
                            <li>… and {errors.length - 12} more.</li>
                          )}
                        </ul>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Weekly overview ───────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PackageOpen className="size-4 text-teal" />
              Overview — Week of {formatShortDate(weekStart)}
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={overviewLoading || refreshing}
              onClick={recheck}
            >
              <RefreshCw
                className={`mr-1 size-3.5 ${(overviewLoading || refreshing) ? "animate-spin" : ""}`}
              />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 font-medium">Needs transport</th>
                  <th className="px-3 py-2 font-medium">10 PM</th>
                  <th className="px-3 py-2 font-medium">11 PM</th>
                  <th className="px-3 py-2 font-medium">12 AM-6 AM</th>
                  <th className="px-3 py-2 font-medium">Total routes</th>
                  <th className="px-3 py-2 font-medium">Finalized</th>
                </tr>
              </thead>
              <tbody>
                {overview.map((day) => (
                  <tr
                    key={day.dayOfWeek}
                    className="border-b last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-3 py-2 font-medium">
                      {DAY_LABELS[day.dayOfWeek]}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {day.approvedEmployees}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{day.byShift["10PM"]}</td>
                    <td className="px-3 py-2 tabular-nums">{day.byShift["11PM"]}</td>
                    <td className="px-3 py-2 tabular-nums">{day.byShift["12AMPlus"]}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {day.routesGenerated > 0 ? (
                        <Badge variant="secondary">{day.routesGenerated}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {day.finalized > 0 ? (
                        <Badge variant="outline" className="border-green text-green">
                          {day.finalized}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-muted-foreground">
                  <td className="px-3 py-2 font-medium text-foreground">Total</td>
                  <td className="px-3 py-2 tabular-nums">{totalApproved}</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 tabular-nums font-medium">{totalRoutes}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Generated routes: day-by-day, vehicle-by-vehicle ── */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BusFront className="size-4 text-teal" />
              Generated routes — Day &amp; vehicle breakdown
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={detailLoading || refreshing}
              onClick={() => refreshDetails(weekStart)}
            >
              <RefreshCw
                className={`mr-1 size-3.5 ${detailLoading ? "animate-spin" : ""}`}
              />
              {detailLoading ? "Loading…" : "Reload"}
            </Button>
          </div>
          <CardDescription>
            Which employees are on which vehicle, per shift and per day, with
            their pickup times. Tap a day to expand it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {routesDetail?.map((day, idx) => {
              const count = day.routes.length;
              return (
                <Button
                  key={day.dayOfWeek}
                  type="button"
                  variant={activeDay === idx ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setActiveDay(idx)}
                >
                  {day.dayLabel}
                  <Badge
                    variant={activeDay === idx ? "secondary" : "outline"}
                    className="tabular-nums"
                  >
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>

          {detailLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg border bg-background"
                />
              ))}
            </div>
          ) : routesDetail && routesDetail[activeDay]?.routes.length > 0 ? (
            <div className="space-y-3">
              {routesDetail[activeDay].routes.map((route) => (
                <GeneratedRouteCard key={route.id} route={route} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <MapPin className="size-6 text-muted-foreground/50" />
              No routes generated for {DAY_LABELS[activeDay]}. Run mapping
              above, or pick another day / week.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── How it works ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4 text-teal" />
            How mapping executes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="font-semibold text-foreground">10 PM — preset points</p>
            Employees on the 10 PM shift are picked up at the preset pickup
            points you define in{" "}
            <Link href="/facilities/route-setting" className="underline">
              Route Setting
            </Link>
            . Skipped points pull later ETAs earlier (15 min each).
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-semibold text-foreground">11 PM — dynamic (max 5)</p>
            Employees are clustered in groups of up to 5. OSRM solves the pickup
            order (/trip) and pickup times come from the distance matrix. Home
            addresses are auto-geocoded via OpenStreetMap when missing.
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-semibold text-foreground">12 AM-6 AM — reuse</p>
            Same dynamic clustering per shift, reusing 10 PM vehicles after a
            rest period (45 min by default). Vehicles pinned to a shift in Route
            Setting are used first.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "ok" | "danger";
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "danger"
            ? "text-destructive"
            : tone === "ok"
              ? "text-green"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-amber/10 text-amber border-amber/30",
  UNDER_REVIEW: "bg-cyan/10 text-cyan border-cyan/30",
  FINALIZED: "bg-green/10 text-green border-green/30",
  EXECUTED: "bg-muted text-muted-foreground border-border",
};

function GeneratedRouteCard({
  route,
}: {
  route: GeneratedRouteDetail;
}) {
  const [showMap, setShowMap] = useState(false);

  const mapStops = route.trips
    .filter((t) => t.pickupLat != null && t.pickupLng != null)
    .map((t) => ({
      lat: t.pickupLat as number,
      lng: t.pickupLng as number,
      sequence: t.sequenceInTrip,
      name: t.employeeName,
      label: t.pickupLocationLabel,
      time: t.pickupTime,
      travelFromPreviousMin: t.travelFromPreviousMin,
      travelToOfficeMin: t.travelToOfficeMin,
    }));

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-accent/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Truck className="size-5 text-teal" />
          <div>
            <p className="flex items-center gap-2">
              {route.vehicle.vehicleNumber ?? "Vehicle"}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                aria-expanded={showMap}
                onClick={() => setShowMap((v) => !v)}
              >
                <Map className="size-3.5" />
                {showMap ? "Hide route map" : "Route map"}
              </Button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {route.vehicle.vehicleType ?? "—"} · {route.vehicle.capacity ?? "—"} seats ·{" "}
              {route.vehicle.officeLocation ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{route.arrivalTime}</Badge>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              STATUS_TONE[route.status] ?? "bg-muted text-muted-foreground border-border"
            }`}
          >
            {route.status}
          </span>
        </div>
      </div>

      {showMap && (
        <div className="border-b bg-card px-4 py-3">
          <RouteMapView
            stops={mapStops}
            destination={route.destination}
            vehicleNumber={route.vehicle.vehicleNumber}
            arrivalTime={route.arrivalTime}
            pickupDriveMinutes={route.pickupDriveMinutes}
            departureToFirstMinutes={route.departureToFirstMinutes}
            routeKey={route.id}
          />
        </div>
      )}

      <div
        className={
          route.vehicle.driverName || route.vehicle.driverContact
            ? "flex flex-wrap gap-x-4 gap-y-1 border-b bg-card px-4 py-2 text-xs text-muted-foreground"
            : "hidden"
        }
      >
        <span>
          <Users className="mr-1 inline size-3.5" />
          {route.vehicle.driverName ?? "No driver"}
          {route.vehicle.driverContact ? ` · ${route.vehicle.driverContact}` : ""}
        </span>
        <span>
          <Clock className="mr-1 inline size-3.5" />
          Departs {formatTime(route.departureTime)} · ETA office{" "}
          {formatTime(route.estimatedCompletionTime)}
        </span>
      </div>

      {route.trips.length > 0 ? (
        <>
          <ul className="divide-y divide-border sm:hidden">
            {route.trips.map((trip) => (
              <li
                key={`${route.id}-${trip.sequenceInTrip}`}
                className="px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {trip.employeeName}
                    {trip.employeeCode ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {trip.employeeCode}
                      </span>
                    ) : null}
                  </p>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Stop {trip.sequenceInTrip}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1 text-xs">
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 text-foreground/90">
                      {trip.pickupLocationLabel ?? "—"}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span className="font-medium tabular-nums text-teal">
                      {trip.pickupTime ?? "—"}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Pick-up Point</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Pick-up Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {route.trips.map((trip) => (
                  <tr
                    key={`${route.id}-${trip.sequenceInTrip}`}
                    className="hover:bg-accent/30"
                  >
                    <td className="px-4 py-2.5 align-top font-medium">
                      {trip.employeeName}
                      {trip.employeeCode ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {trip.employeeCode}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 align-top text-muted-foreground">
                      <span className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" />
                        <span className="min-w-0">
                          {trip.pickupLocationLabel ?? "—"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-teal align-top">
                      {trip.pickupTime ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No employees assigned to this route yet.
        </p>
      )}
    </div>
  );
}