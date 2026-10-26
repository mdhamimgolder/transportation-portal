"use client";

import { useState } from "react";
import { Brain, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getRouteMemoryDiagnostic,
  type RouteMemoryDiagnostic,
} from "@/actions/route-learning.actions";

function fmt(n: number): string {
  return Math.round(n * 10) / 10 === Math.round(n)
    ? String(Math.round(n))
    : (Math.round(n * 10) / 10).toFixed(1);
}

/**
 * "Why these pick-up times?" — every learned leg with its observations,
 * trusted or not, plus the rules the planner applies when choosing a time.
 */
export function RouteMemoryDiagnostics() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RouteMemoryDiagnostic | null>(null);

  function load() {
    setLoading(true);
    getRouteMemoryDiagnostic()
      .then((res) => setData(res))
      .catch(() =>
        setData({ success: false, error: "Failed to load route memory." })
      )
      .finally(() => setLoading(false));
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        disabled={loading}
        onClick={() => {
          setOpen(true);
          if (!data || !data.success) load();
        }}
      >
        {loading ? (
          <RefreshCw className="size-3.5 animate-spin" />
        ) : (
          <Brain className="size-3.5" />
        )}
        Why these times?
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Route memory — why pick-up times look like this</DialogTitle>
            <DialogDescription>
              Every learned leg and whether the planner trusts it yet.
            </DialogDescription>
          </DialogHeader>

          {data && !data.success ? (
            <p className="text-sm text-destructive">{data.error}</p>
          ) : data && data.success ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border bg-accent/20 px-3 py-2 text-xs">
                <span>
                  <strong>{data.trusted}</strong> trusted legs
                </span>
                <span>
                  <strong>{data.untrusted}</strong> not trusted yet
                </span>
                <span>
                  <strong>{data.totalObservations}</strong> observations
                </span>
                <span>
                  <strong>{data.manualEntryCount}</strong> manual-plan rows
                </span>
                <span>
                  <strong>{data.bridgedEmployees}</strong> bridged riders
                </span>
                <span>min samples: {data.minSamplesRequired}</span>
              </div>

              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {data.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading route memory…</p>
          )}

          {data && data.success ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-accent/30 text-left uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">Shift</th>
                    <th className="px-2 py-1.5 font-medium">From → To</th>
                    <th className="px-2 py-1.5 text-right font-medium">Avg</th>
                    <th className="px-2 py-1.5 text-right font-medium">Min</th>
                    <th className="px-2 py-1.5 text-right font-medium">Max</th>
                    <th className="px-2 py-1.5 text-right font-medium">Samples</th>
                    <th className="px-2 py-1.5 font-medium">Planner uses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.legs.map((leg, i) => (
                    <tr key={i} className={leg.trusted ? "" : "text-muted-foreground"}>
                      <td className="px-2 py-1.5">{leg.shiftKey}</td>
                      <td className="px-2 py-1.5">
                        {leg.from ?? "Office"} → {leg.to ?? "Office"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmt(leg.avgMinutes)} min
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmt(leg.minMinutes)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmt(leg.maxMinutes)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {leg.sampleCount}
                      </td>
                      <td className="px-2 py-1.5">
                        {leg.trusted ? (
                          <span className="rounded-full border border-green/40 bg-green/10 px-2 py-0.5 text-[11px] font-medium text-green">
                            Your time (trusted)
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] font-medium text-amber-foreground">
                              Untrained — finalize / teach more days
                            </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.legs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-2 py-3 text-center text-muted-foreground"
                      >
                        Nothing learned yet — run RUN MAPPING or teach a manual plan.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={load}
            >
              <RefreshCw className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
