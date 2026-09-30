/**
 * Manual-plan training (pure math — no Prisma, no fetch).
 *
 * Facilities can upload a MANUALLY made route plan as CSV ("Teach from manual
 * plan" on the Auto Route Planner). Each row is one employee's pickup on a
 * date/shift/vehicle. This module turns those rows into leg observations —
 * pickup→pickup and last-pickup→office gaps — that
 * `trainRoutePlannerFromHistory` merges into `RouteLegLearning` alongside the
 * mined history. Trained legs (>= LEARN_MIN_SAMPLES observations) are the ONLY
 * source of pick-up times — the old 5 min/km distance estimate was removed — so
 * hand-tuned times are what the planner uses.
 *
 * All parsing/aggregation here is deliberately dependency-free so it is
 * unit-testable with `node:test`.
 */

/** Parse "HH:mm" or "HH:mm:ss" (24h) or "h:mm[:ss] AM/PM" into minutes-from-midnight (0..1440). */
export function parseClockTime(raw: string | null | undefined): number | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const match = value.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes > 59) return null;
  const suffix = match[3]?.toUpperCase();
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;
  } else if (hours > 24 || (hours === 24 && minutes > 0)) {
    return null;
  }
  const total = hours * 60 + minutes;
  if (total > 1440) return null;
  return total;
}

/** Map a shift label ("10 PM", "11PM", "1 AM", "LATE NIGHT") to its shiftKey. */
export function shiftKeyForShiftLabel(raw: string | null | undefined): string | null {
  const normalized = (raw ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (!normalized) return null;
  if (normalized === "10PM") return "10PM";
  if (normalized === "11PM") return "11PM";
  if (normalized === "12AM6AM" || normalized === "LATENIGHT") return "12AM-6AM";
  if (/^(12|[1-6])AM$/.test(normalized)) return "12AM-6AM";
  return null;
}

/**
 * Map a clock time (minutes-from-midnight) to its shift bucket. Manual plans
 * often write the office arrival into the shift column ("10:30 PM"), which is
 * the same thing: 22:00–22:59 → 10PM, 23:00–23:59 → 11PM,
 * 00:00–06:59 → 12AM-6AM. Returns null for times outside the three shifts
 * (e.g. 6:00 PM).
 */
export function shiftKeyFromClockTime(minutes: number): string | null {
  if (!Number.isFinite(minutes)) return null;
  const hour = Math.floor((minutes % 1440) / 60);
  if (hour === 22) return "10PM";
  if (hour === 23) return "11PM";
  if (hour <= 6) return "12AM-6AM";
  return null;
}

export type ManualEntryLike = {
  id: string;
  /** Plan date (any representation; only used for grouping). */
  date: Date | string;
  shiftKey: string;
  vehicleNumber: string;
  /** Pickup address id — the "addr:<id>" learning key source. */
  addressId: string | null;
  pickupLabel: string;
  /** 0..1439 minutes-from-midnight. */
  pickupMinutes: number;
  orderIndex: number | null;
  officeLabel: string;
  /** Parsed office arrival (0..1440; wrapped per-run below). */
  arrivalMinutes: number;
};

export type ManualLegObservation = {
  fromKey: string;
  fromLabel: string;
  toKey: string;
  toLabel: string;
  gapMinutes: number;
  shiftKey: string;
};

/** Learning legs longer than 4 hours are noise (same cap as mined history). */
const MAX_LEG_MINUTES = 240;

/**
 * Rotate circular minute-of-day values into chronological run order. Finds
 * the largest gap between consecutive circular values — that gap is midnight
 * (or the off-route dead time) the run wraps across — and re-expresses every
 * time relative to the value right after it, so the run starts at 0 and
 * ascends. A run that never crosses midnight rotates to its own first pickup
 * (offset 0 in effect for ordering purposes).
 */
function rotateForChronology(minutes: number[]): { ordered: number[]; offset: number } {
  const n = minutes.length;
  if (n === 0) return { ordered: [], offset: 0 };
  const sorted = [...minutes].sort((a, b) => a - b);
  if (n === 1) return { ordered: [0], offset: sorted[0] };
  let largestGap = -1;
  let offset = sorted[0];
  for (let i = 0; i < n; i++) {
    const next = i === n - 1 ? sorted[0] : sorted[i + 1];
    const gap = (next - sorted[i] + 1440) % 1440;
    if (gap > largestGap) {
      largestGap = gap;
      offset = next;
    }
  }
  return {
    ordered: sorted
      .map((m) => (m - offset + 1440) % 1440)
      .sort((a, b) => a - b),
    offset,
  };
}

/**
 * Group manual-plan entries into per-run leg observations. Runs are keyed by
 * (date, shiftKey, vehicleNumber). Within a run the stops are put into
 * chronological order (midnight-crossing aware), then every consecutive
 * pickup pair and the last pickup → office arrival become one observation.
 * Returns per-group problems instead of throwing so a bad group never blocks
 * good rows from training the planner.
 */
export function legObservationsFromManualEntries(
  entries: ReadonlyArray<ManualEntryLike>
): { observations: ManualLegObservation[]; issues: string[] } {
  const observations: ManualLegObservation[] = [];
  const issues: string[] = [];

  const groups = new Map<string, ManualEntryLike[]>();
  for (const entry of entries) {
    if (!entry.addressId) continue; // cannot form a learning key — skip quietly
    const dateKey =
      entry.date instanceof Date ? entry.date.toISOString() : String(entry.date);
    const key = `${dateKey}|${entry.shiftKey}|${entry.vehicleNumber.trim()}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  for (const [groupKey, members] of groups) {
    if (members.length === 0) continue;
    const shiftKey = members[0].shiftKey;
    const officeLabel = members[0].officeLabel;
    const officeKey = `office:${officeLabel}`;

    // Modal arrival across the run (all rows should agree; tolerate typos by
    // taking the most common value).
    const arrivalCounts = new Map<number, number>();
    for (const m of members) {
      arrivalCounts.set(m.arrivalMinutes, (arrivalCounts.get(m.arrivalMinutes) ?? 0) + 1);
    }
    let arrival = -1;
    let arrivalVotes = 0;
    for (const [value, votes] of arrivalCounts) {
      if (votes > arrivalVotes || (votes === arrivalVotes && value > arrival)) {
        arrival = value;
        arrivalVotes = votes;
      }
    }

    const { offset } = rotateForChronology(members.map((m) => m.pickupMinutes));
    const arrivalOrdered = (arrival - offset + 1440) % 1440;

    // Chronologically ordered stops with their labels/keys.
    const stops = members
      .map((m) => ({
        entry: m,
        ordered: (m.pickupMinutes - offset + 1440) % 1440,
      }))
      .sort(
        (a, b) =>
          a.ordered - b.ordered ||
          (a.entry.orderIndex ?? 0) - (b.entry.orderIndex ?? 0)
      );

    for (let i = 0; i < stops.length - 1; i++) {
      const gap = stops[i + 1].ordered - stops[i].ordered;
      if (gap < 1 || gap > MAX_LEG_MINUTES) {
        issues.push(`${groupKey}: pickup gap ${gap} min between consecutive stops is out of range`);
        continue;
      }
      observations.push({
        fromKey: `addr:${stops[i].entry.addressId}`,
        fromLabel: stops[i].entry.pickupLabel,
        toKey: `addr:${stops[i + 1].entry.addressId}`,
        toLabel: stops[i + 1].entry.pickupLabel,
        gapMinutes: gap,
        shiftKey,
      });
    }

    const lastGap = arrivalOrdered - stops[stops.length - 1].ordered;
    if (lastGap < 1 || lastGap > MAX_LEG_MINUTES) {
      issues.push(`${groupKey}: last pickup → office gap ${lastGap} min is out of range`);
    } else {
      observations.push({
        fromKey: `addr:${stops[stops.length - 1].entry.addressId}`,
        fromLabel: stops[stops.length - 1].entry.pickupLabel,
        toKey: officeKey,
        toLabel: officeLabel,
        gapMinutes: lastGap,
        shiftKey,
      });
    }
  }

  return { observations, issues };
}