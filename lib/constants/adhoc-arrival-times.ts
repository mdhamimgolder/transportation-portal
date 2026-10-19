// Ad-hoc requests are for same-day emergency transport, covering the overnight
// window from 10:00 PM tonight through 6:00 AM the next morning -- this window
// is available every day of the week (no weekday/deadline restriction, unlike
// the Weekly form's Mon-Fri + Saturday-midnight lock).

import {
  addUtcCalendarDays,
  dhakaDateTimeFromMinutes,
} from "@/lib/date/week";

function to12Hour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

// Whole hours only, in overnight order: 10 PM, 11 PM, then 12 AM..6 AM
const OVERNIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6];

export type AdhocArrivalOption = { value: string; label: string };

export const ADHOC_ARRIVAL_TIME_OPTIONS: AdhocArrivalOption[] =
  OVERNIGHT_HOURS.map((hour) => ({
    value: `${hour.toString().padStart(2, "0")}:00`,
    label: to12Hour(hour),
  }));

// Ad-hoc requests need at least 3 hours' notice: a submission at 8:00 PM can
// only ask for an arrival of 11:00 PM or later. Enforced server-side and in
// the request forms (the select options are filtered to what's still eligible).
export const ADHOC_MIN_ADVANCE_HOURS = 3;

// For the 10:00 PM arrival the pick-up point is essential (employees board
// from a specific spot at night); for other overnight arrivals it is optional.
export const ADHOC_PICKUP_REQUIRED_TIME = "22:00";

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Resolve an arrival-time string against a base date (a UTC-midnight Dhaka
 * date key). Hours in the overnight window come "tonight" for 22:00/23:00 and
 * "tomorrow morning" for 00:00..06:00, matching the ad-hoc window's semantics.
 * Returns the actual arrival moment as a UTC instant, computed with explicit
 * Asia/Dhaka wall-clock math so server, client, and CI agree regardless of
 * host timezone or device clock zone. Never uses host-local `setHours`.
 */
export function resolveAdhocArrival(baseDate: Date, arrivalTime: string): Date {
  const hour = Number.parseInt(arrivalTime.split(":")[0], 10);
  if (Number.isNaN(hour)) return new Date(baseDate);
  if (hour >= 22) return dhakaDateTimeFromMinutes(baseDate, hour * 60);
  return dhakaDateTimeFromMinutes(addUtcCalendarDays(baseDate, 1), hour * 60);
}

/** The earliest arrival moment allowed by the 3-hour advance rule. */
export function earliestAdhocArrival(now: Date = new Date()): Date {
  return new Date(now.getTime() + ADHOC_MIN_ADVANCE_HOURS * MS_PER_HOUR);
}

/** Whether an arrival (resolved against `baseDate`) still satisfies the rule. */
export function isAdhocArrivalEligible(
  baseDate: Date,
  arrivalTime: string,
  now: Date = new Date()
): boolean {
  return (
    resolveAdhocArrival(baseDate, arrivalTime).getTime() >=
    earliestAdhocArrival(now).getTime()
  );
}

/** The arrival options that are still selectable under the rule. */
export function eligibleAdhocArrivalOptions(
  baseDate: Date,
  now: Date = new Date()
): AdhocArrivalOption[] {
  return ADHOC_ARRIVAL_TIME_OPTIONS.filter((option) =>
    isAdhocArrivalEligible(baseDate, option.value, now)
  );
}
