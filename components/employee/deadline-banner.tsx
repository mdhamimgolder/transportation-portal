"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Closed";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Ice-blue deadline banner for the employee dashboard (design 2a).
 *  `deadline` is the ISO close time from getSubmissionWindow; `opensAt` the window open time,
 *  used to fill the progress bar with the fraction of the window elapsed. */
export function DeadlineBanner({
  deadline,
  opensAt,
}: {
  deadline: string;
  opensAt: string;
}) {
  const target = new Date(deadline).getTime();
  const start = new Date(opensAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const remaining = target - now;
  const progress =
    target > start
      ? Math.min(100, Math.max(0, ((now - start) / (target - start)) * 100))
      : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[rgba(174,242,255,0.35)] bg-black px-6 py-4">
      <p className="font-mono text-xs font-medium tracking-[0.12em] text-[#aef2ff] uppercase">
        Submission deadline
      </p>
      <p className="font-display text-2xl font-bold tracking-tight tabular-nums text-white">
        {formatRemaining(remaining)}
      </p>
      <p className="text-sm text-white/60">
        until weekly schedule closes
      </p>
      <div className="ml-auto h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#aef2ff]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
