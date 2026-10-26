"use client";

import { useEffect, useState } from "react";

type ServerTimeResponse = {
  now: string;
  todayKey: string;
  timeZone: string;
};

type ServerDhakaTime = {
  /** Effective "now" derived from the server clock + monotonic elapsed time. Null while syncing. */
  now: Date | null;
  /** Today's canonical UTC-midnight Dhaka date key from the server. Null while syncing. */
  todayKey: Date | null;
  /** True while the initial /api/time fetch is in flight. */
  loading: boolean;
  /** True when the server clock could not be reached and device clock is used as fallback. */
  unsynced: boolean;
};

/**
 * Server-synced Dhaka clock for ad-hoc eligibility.
 *
 * Why: filtering arrival options with `new Date()` trusts the device clock —
 * a wrong device time/timezone hides valid slots or shows ineligible ones.
 * This hook fetches the authoritative server instant once (`/api/time`, itself
 * NTP/internet-synced) and advances it with `performance.now()` elapsed time,
 * which is monotonic and immune to later device-clock changes. The ticking
 * `now` re-renders every 30s so the 3-hour cutoff rolls over without reload.
 *
 * Fallback: if the fetch fails (offline), the device clock is used so the
 * form still works; `unsynced` flags the UI to warn. Server Actions always
 * re-enforce the rule with the server clock regardless.
 */
export function useServerDhakaTime(): ServerDhakaTime {
  const [serverNowAtSync, setServerNowAtSync] = useState<number | null>(null);
  const [perfAtSync, setPerfAtSync] = useState(0);
  const [todayKey, setTodayKey] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsynced, setUnsynced] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      try {
        const res = await fetch("/api/time", { cache: "no-store" });
        if (!res.ok) throw new Error(`time sync ${res.status}`);
        const body = (await res.json()) as ServerTimeResponse;
        if (cancelled) return;
        const serverNow = new Date(body.now);
        const key = new Date(body.todayKey);
        if (Number.isNaN(serverNow.getTime()) || Number.isNaN(key.getTime())) {
          throw new Error("invalid server time");
        }
        setServerNowAtSync(serverNow.getTime());
        setPerfAtSync(performance.now());
        setTodayKey(key);
        setNow(serverNow);
        setUnsynced(false);
      } catch {
        if (!cancelled) {
          setUnsynced(true);
          setNow(new Date());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    sync();
    return () => {
      cancelled = true;
    };
  }, []);

  // Advance the synced clock with monotonic elapsed time (immune to later
  // device-clock changes) and re-render every 30s so cutoffs roll over.
  useEffect(() => {
    if (serverNowAtSync == null) return;
    const id = setInterval(() => {
      const elapsed = performance.now() - perfAtSync;
      setNow(new Date(serverNowAtSync + Math.max(0, elapsed)));
    }, 30_000);
    return () => clearInterval(id);
  }, [serverNowAtSync, perfAtSync]);

  if (serverNowAtSync != null && todayKey && now) {
    return { now, todayKey, loading, unsynced };
  }
  if (!loading) {
    return { now: now ?? new Date(), todayKey, loading, unsynced: true };
  }
  return { now: null, todayKey: null, loading, unsynced: false };
}
