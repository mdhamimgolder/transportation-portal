"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarDays,
  CalendarRange,
  BusFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  PackageOpen,
  Play,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
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
  generateDayRoutes,
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
import { ManualPlanUploadDialog } from "@/components/facilities/manual-plan-upload-dialog";
import { RouteMemoryDiagnostics } from "@/components/facilities/route-memory-diagnostics";
import { RouteBreakdown } from "@/components/facilities/route-breakdown";
import { DAY_LABELS, formatShortDate, getMondayOfWeek } from "@/lib/date/week";

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
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  // Day-wise run mapping: single selected weekday + its own run state.
  const [dayIndex, setDayIndex] = useState(0);
  const [dayRunning, setDayRunning] = useState(false);
  const [dayResult, setDayResult] = useState<GenerateRoutesResult | null>(null);
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

  /** In-place replacement of one updated route card — day-wise breakdown patches
   *  without any loading skeleton, so a finalize / reorder / time edit never
   *  triggers a page refresh. */
  const patchRouteInDay = useCallback((updated: GeneratedRouteDetail) => {
    setRoutesDetail((prev) =>
      prev
        ? prev.map((day) =>
            day.routes.some((r) => r.id === updated.id)
              ? {
                  ...day,
                  routes: day.routes.map((r) => (r.id === updated.id ? updated : r)),
                }
              : day
          )
        : prev
    );
  }, []);

  useEffect(() => {
    void loadDetails(weekStart);
  }, [weekStart, loadDetails]);

  useEffect(() => {
    getRouteLearningStats()
      .then((s) => setLearningStats(s))
      .catch(() => setLearningStats(null));
  }, []);

  const refreshLearningStats = useCallback(() => {
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

  /** Run route mapping for ONE selected weekday only — the rest of the week's
   *  draft routes are untouched. Afterwards the breakdown below is focused on
   *  the mapped day so its planning is immediately visible. */
  async function runDayMapping() {
    setDayRunning(true);
    setDayResult(null);
    try {
      const res = await generateDayRoutes(toISODate(weekStart), dayIndex);
      setDayResult(res);
      setActiveDay(dayIndex);
      getRouteLearningStats()
        .then((s) => setLearningStats(s))
        .catch(() => setLearningStats(null));
      void refreshOverview(weekStart);
      void refreshDetails(weekStart);
    } finally {
      setDayRunning(false);
    }
  }

  const dayResultStatus = dayResult
    ? dayResult.success
      ? "success"
      : dayResult.summary.totalErrors > 0 &&
          dayResult.summary.routesGenerated10PM +
            dayResult.summary.routesGenerated11PM +
            dayResult.summary.routesGenerated12AMPlus >
            0
        ? "partial"
        : "failed"
    : null;

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
                    {learningStats.manualEntryCount > 0
                      ? ` · ${learningStats.manualEntryCount} manual-plan rows`
                      : ""}
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
              <div className="flex shrink-0 items-center gap-2">
                <ManualPlanUploadDialog onImported={refreshLearningStats} />
                <RouteMemoryDiagnostics />
                <span className="text-xs text-muted-foreground">
                  Automatic after each mapping
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Every RUN MAPPING first mines all past route plans for the real
              pickup-to-pickup gaps Facilities tuned day by day, then plans with
              them. Pick-up times come from trained legs only (3+ observations);
              a leg that was never finalized or taught errors that route instead
              of being estimated. Use “Teach from manual plan” to upload a route
              plan you made by hand — its real pickup gaps are merged into the
              same memory and survive every retrain.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Day-wise run mapping ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-teal" />
            Day-wise run mapping
          </CardTitle>
          <CardDescription>
            Generate route planning for a single day of the week — the other
            days&apos; drafts are left untouched. Weekly RUN MAPPING (above)
            plans the full week; this maps only the day you select.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {routesDetail?.map((day, idx) => (
                <Button
                  key={day.dayOfWeek}
                  type="button"
                  variant={dayIndex === idx ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setDayIndex(idx);
                    setDayResult(null);
                  }}
                >
                  {DAY_LABELS[idx]}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              className="gap-2"
              disabled={dayRunning}
              onClick={runDayMapping}
            >
              {dayRunning ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {dayRunning
                ? `Mapping ${DAY_LABELS[dayIndex]}…`
                : `Run mapping for ${DAY_LABELS[dayIndex]}`}
            </Button>
          </div>

          {dayRunning && (
            <p className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-teal-foreground">
              <RefreshCw className="size-4 animate-spin" />
              Refreshing route memory, then generating 10 PM → 11 PM → 12 AM-6
              AM routes for {DAY_LABELS[dayIndex]} only — the rest of the week
              is left untouched.
            </p>
          )}

          {dayResult && dayResultStatus && (
            <div className="rounded-lg border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                {dayResultStatus === "success" ? (
                  <CheckCircle2 className="size-4 text-green" />
                ) : (
                  <AlertTriangle className="size-4 text-destructive" />
                )}
                <span className="text-sm font-medium">
                  {DAY_LABELS[dayResult.dayOfWeek ?? dayIndex]} mapping —{" "}
                  {dayResultStatus === "success"
                    ? "routes generated cleanly"
                    : dayResultStatus === "partial"
                      ? "some entries had problems"
                      : "no routes were created"}
                </span>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <ResultStat
                    label="10 PM routes"
                    value={dayResult.summary.routesGenerated10PM}
                  />
                  <ResultStat
                    label="11 PM routes"
                    value={dayResult.summary.routesGenerated11PM}
                  />
                  <ResultStat
                    label="12 AM-6 AM routes"
                    value={dayResult.summary.routesGenerated12AMPlus}
                  />
                  <ResultStat
                    label="Errors"
                    value={dayResult.summary.totalErrors}
                    tone={dayResult.summary.totalErrors > 0 ? "danger" : "ok"}
                  />
                </div>

                {dayResult.learning && !dayResult.learning.success && (
                  <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber-foreground">
                    Route memory refresh failed this run — routes with untrained
                    legs will error (pickup times are trained-gap only).{" "}
                    {dayResult.learning.error}
                  </p>
                )}

                {dayResult.summary.totalErrors > 0 && (
                  <div className="mt-3 space-y-2">
                    {(
                      ["errors10PM", "errors11PM", "errors12AMPlus"] as const
                    ).map((key) => {
                      const errors = dayResult.details[key];
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
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
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
                Route memory refresh failed this run — routes with untrained legs
                will error (pickup times are trained-gap only).{" "}
                {result.learning.error}
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
            Which employees are on which vehicle, per shift and per day. Drag a
            row to reorder it or drop it onto another vehicle, click a pick-up
            time to edit it — then <b>Finalize</b> each vehicle to lock its
            schedule and email the riders.
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
            <RouteBreakdown
              routes={routesDetail[activeDay].routes}
              activeRouteId={activeRouteId}
              onRouteSelect={setActiveRouteId}
              onRefresh={() => refreshDetails(weekStart)}
              onChanged={() => void loadDetails(weekStart)}
              onRouteUpdated={patchRouteInDay}
              isLoading={detailLoading}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <MapPin className="size-6 text-muted-foreground/50" />
              No routes generated for {DAY_LABELS[activeDay]}. Run mapping
              above, or pick another day / week.
            </div>
          )}
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