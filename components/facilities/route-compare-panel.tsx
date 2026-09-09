"use client";

import { useState } from "react";
import { CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CandidateId,
  RouteAnalysis,
  RouteCandidate,
} from "@/lib/routing/route-analysis.types";

interface RouteComparePanelProps {
  analysis: RouteAnalysis;
  selectedId: CandidateId;
  onSelect: (id: CandidateId) => void;
  appliedCandidateId: string | null;
  /** "PRESET_10PM" routes can also push the order into Route Setting. */
  routeType: string;
  applying: boolean;
  onApply: (id: CandidateId, alsoUpdatePresetSequence: boolean) => Promise<void>;
  analyzing: boolean;
  onReanalyze: () => void;
}

/**
 * Short stop-order string: "Zigatola → Dhanmondi 15 → Office". Preset routes
 * name the pickup point; home-address routes name the rider.
 */
export function orderLabel(
  analysis: RouteAnalysis,
  candidate: RouteCandidate,
  routeType?: string
): string {
  const seen = new Set<number>();
  const parts: string[] = [];
  const preset = routeType === "PRESET_10PM";
  for (const w of candidate.order) {
    const wp = analysis.waypoints[w];
    if (!wp) continue;
    if (wp.isOffice) {
      if (candidate.order[0] === w && parts.length === 0) continue; // loop start
      parts.push("Office");
      continue;
    }
    if (seen.has(w)) continue;
    seen.add(w);
    const name =
      !preset && wp.employeeNames.length === 1 ? wp.employeeNames[0] : wp.label;
    parts.push(shorten(name));
  }
  return parts.join(" → ");
}

function shorten(s: string, max = 18): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function RouteComparePanel({
  analysis,
  selectedId,
  onSelect,
  appliedCandidateId,
  routeType,
  applying,
  onApply,
  analyzing,
  onReanalyze,
}: RouteComparePanelProps) {
  const [confirmId, setConfirmId] = useState<CandidateId | null>(null);
  const [alsoPreset, setAlsoPreset] = useState(routeType === "PRESET_10PM");

  const base = analysis.candidates.find((c) => c.id === "current");
  const confirm = confirmId ? analysis.candidates.find((c) => c.id === confirmId) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Compare routes
          {analysis.sideResolution === "unconstrained" ? (
            <span className="ml-2 normal-case tracking-normal text-amber">
              road sides could not be priced
            </span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={analyzing}
          onClick={onReanalyze}
        >
          <RefreshCw className={`size-3.5 ${analyzing ? "animate-spin" : ""}`} />
          Re-analyze
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-accent/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Show</th>
              <th className="px-3 py-2 font-medium">Route</th>
              <th className="px-3 py-2 font-medium">Stop order</th>
              <th className="px-3 py-2 text-right font-medium">Drive</th>
              <th className="px-3 py-2 text-right font-medium">Distance</th>
              <th className="px-3 py-2 text-right font-medium">U-turns</th>
              <th className="px-3 py-2 text-right font-medium">Backtrack</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {analysis.candidates.map((c) => {
              const selected = c.id === selectedId;
              const recommended = c.id === analysis.recommendedId;
              // Once applied, the chosen order IS the stored order, so the
              // badge sits on the "current" row after re-analysis.
              const applied =
                appliedCandidateId != null &&
                (c.id === appliedCandidateId || c.id === "current");
              const deltaMin = base ? c.metrics.durationMin - base.metrics.durationMin : 0;
              return (
                <tr
                  key={c.id}
                  className={`cursor-pointer hover:bg-accent/30 ${selected ? "bg-teal/10" : ""}`}
                  onClick={() => onSelect(c.id)}
                >
                  <td className="px-3 py-2.5 align-top">
                    <input
                      type="radio"
                      name={`route-candidate-${analysis.inputHash}`}
                      aria-label={`Show ${c.label} on the map`}
                      checked={selected}
                      onChange={() => onSelect(c.id)}
                      className="mt-0.5 accent-[#22D3EE]"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      {c.label}
                      {recommended && analysis.candidates.length > 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[11px] font-medium text-teal">
                          <Sparkles className="size-3" />
                          Recommended
                        </span>
                      ) : null}
                      {applied ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green/40 bg-green/10 px-2 py-0.5 text-[11px] font-medium text-green">
                          <CheckCircle2 className="size-3" />
                          Applied
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{c.description}</p>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                    {orderLabel(analysis, c, routeType)}
                    {c.metrics.farNearViolations > 0 ? (
                      <span className="mt-1 block text-amber">
                        {c.metrics.farNearViolations} far→near break
                        {c.metrics.farNearViolations > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {fmt(c.metrics.durationMin)} min
                    {base && c.id !== "current" ? (
                      <span
                        className={`block text-xs ${
                          deltaMin < -0.05 ? "text-green" : deltaMin > 0.05 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {deltaMin > 0 ? "+" : ""}
                        {fmt(deltaMin, 1)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {fmt(c.metrics.distanceKm, 1)} km
                    <span className="block text-xs text-muted-foreground">
                      ×{fmt(c.metrics.detourRatio, 2)} straight
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {c.metrics.uturns}
                    {c.metrics.loopArounds > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {c.metrics.loopArounds} loop-around
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {fmt(c.metrics.backtrackKm, 2)} km
                  </td>
                  <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums">
                    {fmt(c.score, 1)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top">
                    {c.id !== "current" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={recommended ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs"
                        disabled={applying || analyzing}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmId(c.id);
                        }}
                      >
                        Apply
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {analysis.notes.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {analysis.notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Score = drive minutes + 3 per U-turn + 2 per loop-around + 5 per backtracked km.
        Analyzed {new Date(analysis.computedAt).toLocaleString()}.
      </p>

      <Dialog open={confirm != null} onOpenChange={(open) => !open && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply “{confirm?.label}”?</DialogTitle>
            <DialogDescription>
              Stops are re-sequenced and pickup times are recalculated back from the shift
              arrival using this route&apos;s real drive minutes (5-minute grid, at least 5
              minutes apart). Each stop records the side of the road the vehicle should
              stop on.
            </DialogDescription>
          </DialogHeader>
          {confirm ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{orderLabel(analysis, confirm, routeType)}</p>
              <p className="tabular-nums">
                {fmt(confirm.metrics.durationMin)} min · {fmt(confirm.metrics.distanceKm, 1)} km ·{" "}
                {confirm.metrics.uturns} U-turn{confirm.metrics.uturns === 1 ? "" : "s"}
              </p>
              {routeType === "PRESET_10PM" ? (
                <label className="flex items-start gap-2 pt-1 text-sm">
                  <Checkbox
                    checked={alsoPreset}
                    onCheckedChange={(v) => setAlsoPreset(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Also save this order as the vehicle&apos;s preset pickup sequence in Route
                    Setting (future weeks inherit it).
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmId(null)} disabled={applying}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={applying || !confirm}
              onClick={async () => {
                if (!confirm) return;
                await onApply(confirm.id, alsoPreset && routeType === "PRESET_10PM");
                setConfirmId(null);
              }}
            >
              {applying ? <RefreshCw className="mr-1 size-3.5 animate-spin" /> : null}
              Apply route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
