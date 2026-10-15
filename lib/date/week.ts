/**
 * Weekly submission window logic + canonical week/day date keys.
 *
 * Rule (PRD 4.2): employees submit a Mon-Fri schedule for the *upcoming* week;
 * the window locks at Saturday 12:00 PM. Once that Saturday-noon deadline for
 * a given target week passes, the window rolls forward to the following week
 * (whose own deadline is exactly 7 days later).
 *
 * CANONICAL KEYS — read this before touching dates:
 * Every week/day key (`weeklySchedule.weekStartDate`, `weeklyScheduleDay.date`,
 * `routePlan.weekStartDate/dayDate`, `adHocRequest.date`) is stored as a UTC
 * midnight instant whose calendar date equals the ASIA/DHAKA calendar date.
 * All helpers below are explicit about Asia/Dhaka and NEVER use the host
 * timezone (`getDay`, `setHours`, `getDate`, `toDateString`, ...), so dev
 * machines, CI, and production servers behave identically.
 */

export const TIME_ZONE = "Asia/Dhaka";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Fixed UTC+6 offset — Bangladesh observes no daylight saving time. */
const DHAKA_UTC_OFFSET_MINUTES = 6 * 60;

/** Calendar date (year/month/day) of `date` as seen in Asia/Dhaka. */
function dhakaYMD(date: Date): { y: number; m: number; d: number } {
  const shifted = new Date(date.getTime() + DHAKA_UTC_OFFSET_MINUTES * 60 * 1000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
  };
}

/** Day of week of `date` as seen in Asia/Dhaka (0=Sun .. 6=Sat). */
function dhakaDay(date: Date): number {
  return new Date(date.getTime() + DHAKA_UTC_OFFSET_MINUTES * 60 * 1000).getUTCDay();
}

/** Convert Dhaka wall-clock minutes on a UTC-midnight date key into a UTC instant. */
export function dhakaDateTimeFromMinutes(dayDate: Date, minutes: number): Date {
  return new Date(
    Date.UTC(
      dayDate.getUTCFullYear(),
      dayDate.getUTCMonth(),
      dayDate.getUTCDate(),
      0,
      minutes - DHAKA_UTC_OFFSET_MINUTES
    )
  );
}

/** Read a stored UTC instant as minutes from midnight in Asia/Dhaka. */
export function dhakaMinutesOfDay(date: Date): number {
  return (
    (date.getUTCHours() * 60 +
      date.getUTCMinutes() +
      DHAKA_UTC_OFFSET_MINUTES) %
    (24 * 60)
  );
}

/** Add calendar days to a UTC-midnight date key without using host timezone. */
export function addUtcCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Today's date as a canonical UTC-midnight key (Dhaka calendar). */
export function startOfToday(): Date {
  return toUtcMidnight(new Date());
}

/** Monday (canonical UTC midnight) of the Dhaka-calendar week containing `date`. */
export function getMondayOfWeek(date: Date): Date {
  const { y, m, d } = dhakaYMD(date);
  const diffFromMonday = (dhakaDay(date) + 6) % 7;
  return new Date(Date.UTC(y, m, d) - diffFromMonday * MS_PER_DAY);
}

/** The same Dhaka-calendar date as `date`, expressed at UTC midnight. Week keys
 * (`weeklySchedule.weekStartDate`, `weeklyScheduleDay.date`) are stored this
 * way so RUN MAPPING / route-generation lookups never depend on the server's
 * timezone — every schedule-creating flow MUST pass its week through this
 * before writing to the database. Idempotent on canonical keys. */
export function toUtcMidnight(date: Date): Date {
  const { y, m, d } = dhakaYMD(date);
  return new Date(Date.UTC(y, m, d));
}

/** Canonical week key for any instant inside a week: the UTC-midnight Monday
 * of the Dhaka-calendar week containing `date`. Tolerates legacy
 * Sunday-18:00Z (Dhaka-midnight) keys — they normalize to the same Monday. */
export function normalizeWeekStart(date: Date): Date {
  return toUtcMidnight(getMondayOfWeek(date));
}

/** Parse a "yyyy-mm-dd" calendar string as an Asia/Dhaka date and return its
 * canonical UTC-midnight key. Unlike `new Date("…T00:00:00")` (host-local) or
 * `new Date("…")` (UTC), the result is the same Dhaka calendar day on every
 * host timezone. Returns an invalid Date for malformed input. */
export function parseDayKey(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return new Date(NaN);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return new Date(NaN);
  const key = new Date(Date.UTC(y, m - 1, d));
  // Reject overflow (e.g. month 02 day 30 rolls into March).
  if (key.getUTCFullYear() !== y || key.getUTCMonth() !== m - 1 || key.getUTCDate() !== d) {
    return new Date(NaN);
  }
  return key;
}

export type SubmissionWindow = {
  /** Monday (canonical UTC midnight) of the Mon-Fri week currently open for submission. */
  weekStartDate: Date;
  /** Saturday 12:00 PM Asia/Dhaka deadline instant for that week. */
  deadline: Date;
  /** When this window opened — exactly 7 days before `deadline`. */
  opensAt: Date;
  isOpen: boolean;
};

/**
 * `lockDayOfWeek` is 0=Sun .. 6=Sat (defaults to Saturday, matching the
 * original hardcoded behavior). Super Admin can override day/hour/minute via
 * TransportSettings -- see lib/queries/settings.ts.
 */
export function getSubmissionWindow(
  now: Date = new Date(),
  lockDayOfWeek: number = 6,
  lockHour: number = 12,
  lockMinute: number = 0
): SubmissionWindow {
  const thisMonday = getMondayOfWeek(now);
  const dayOffsetFromMonday = (lockDayOfWeek - 1 + 7) % 7;

  let candidateTargetMonday = new Date(thisMonday.getTime() + MS_PER_WEEK);
  // The lock-day date (canonical key) + Dhaka wall-clock lock time -> instant.
  const lockDateKey = new Date(thisMonday.getTime() + dayOffsetFromMonday * MS_PER_DAY);
  let deadline = dhakaDateTimeFromMinutes(lockDateKey, lockHour * 60 + lockMinute);

  if (now.getTime() > deadline.getTime()) {
    candidateTargetMonday = new Date(candidateTargetMonday.getTime() + MS_PER_WEEK);
    deadline = new Date(deadline.getTime() + MS_PER_WEEK);
  }

  return {
    weekStartDate: candidateTargetMonday,
    deadline,
    opensAt: new Date(deadline.getTime() - MS_PER_WEEK),
    isOpen: now.getTime() <= deadline.getTime(),
  };
}

/** The 5 calendar dates (Mon-Fri, canonical UTC midnight) for a week. The input
 * is normalized to its Monday first, so legacy off-Monday keys still yield the
 * correct Mon-Fri range instead of a shifted Sun-Thu window. */
export function getWeekDays(weekStartDate: Date): Date[] {
  const monday = normalizeWeekStart(weekStartDate);
  return Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * MS_PER_DAY));
}

export const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Deterministic formatting on the UTC calendar (keys are UTC midnight) so
// server and client output identical strings on any host timezone and React
// hydration never mismatches.
export function formatShortDate(date: Date): string {
  const month = SHORT_MONTHS[date.getUTCMonth()];
  return `${date.getUTCDate()} ${month}`;
}
