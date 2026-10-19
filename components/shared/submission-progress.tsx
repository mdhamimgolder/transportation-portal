"use client";

import { useEffect, useState } from "react";
import { formatShortDate, getWeekDays } from "@/lib/date/week";

type TimeSyncResponse = { now: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "3d 14:26:07" style compact remaining-time text. */
function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hh = String(Math.floor((totalSec % 86_400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

const CLOSED_TEXT = "Submission closed";

/**
 * Compact "submission time remaining" meter for the dashboard hero:
 * one caption line + a hairline progress bar from window open → deadline,
 * with a live ticking countdown. Server-clock synced once (/api/time) and
 * advanced with monotonic elapsed time so device clocks can't skew it.
 * Under-24-hours flips the fill to amber for urgency.
 */
export function SubmissionProgress({
  deadlineMs,
  opensAtMs,
  weekStartDate,
}: {
  deadlineMs: number;
  opensAtMs: number;
  weekStartDate: Date;
}) {
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [perfAtSync, setPerfAtSync] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      try {
        const res = await fetch("/api/time", { cache: "no-store" });
        if (!res.ok) throw new Error(`time sync ${res.status}`);
        const body = (await res.json()) as TimeSyncResponse;
        if (cancelled) return;
        setAnchorMs(new Date(body.now).getTime());
        setPerfAtSync(performance.now());
      } catch {
        if (cancelled) return;
        setAnchorMs(Date.now());
        setPerfAtSync(0);
      }
    }
    sync();
    return () => {
      cancelled = true;
    };
  }, []);

  const [elapsedSinceSync, setElapsedSinceSync] = useState(0);
  useEffect(() => {
    if (anchorMs == null) return;
    const id = setInterval(() => {
      setElapsedSinceSync(performance.now() - perfAtSync);
    }, 1000);
    return () => clearInterval(id);
  }, [anchorMs, perfAtSync]);

  const now =
    anchorMs == null ? null : new Date(anchorMs + Math.max(0, elapsedSinceSync));

  const weekRange = `week of ${formatShortDate(getWeekDays(weekStartDate)[0])} – ${formatShortDate(getWeekDays(weekStartDate)[4])}`;

  if (now == null) {
    return (
      <div className="max-w-md space-y-1.5 text-sm text-ink-foreground/55">
        <p className="text-xs font-medium text-ink-foreground/80">
          Upcoming Week · MDS Weekly Schedule remaining
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-foreground/15">
          <div className="h-full w-0 rounded-full bg-ink-foreground/25 transition-[width] duration-500" />
        </div>
        <p className="font-mono text-xs tabular-nums opacity-0">00:00</p>
      </div>
    );
  }

  const remaining = deadlineMs - now.getTime();
  const span = Math.max(1, deadlineMs - opensAtMs);
  const pct = Math.min(100, Math.max(0, ((now.getTime() - opensAtMs) / span) * 100));
  const closingSoon = remaining > 0 && remaining < MS_PER_DAY;
  const closed = remaining <= 0;

  return (
    <div className="max-w-md space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-xs font-medium text-ink-foreground/80">
          Upcoming Week · MDS Weekly Schedule remaining
        </p>
        <p className="text-xs text-ink-foreground/55">{weekRange}</p>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-foreground/15"
          title={
            closed
              ? CLOSED_TEXT
              : "Upcoming week submission window progress (opens → Saturday 12:00 AM deadline)"
          }
        >
          <div
            className={cnFill(closingSoon)}
            style={{ width: `${closed ? 100 : pct}%` }}
          />
        </div>
        <p
          className={`shrink-0 font-mono text-xs font-medium tabular-nums ${
            closed
              ? "text-ink-foreground/45"
              : closingSoon
                ? "text-amber"
                : "text-ink-foreground/80"
          }`}
        >
          {closed ? CLOSED_TEXT : formatRemaining(remaining)}
        </p>
      </div>
    </div>
  );
}

function cnFill(amber: boolean): string {
  return [
    "h-full rounded-full transition-[width] duration-700 ease-out",
    amber ? "bg-amber" : "bg-[var(--role-accent)]",
  ].join(" ");
}
