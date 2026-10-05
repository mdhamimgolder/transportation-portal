/**
 * Weekly submission window logic.
 *
 * Rule (PRD 4.2): employees submit a Mon-Fri schedule for the *upcoming* week;
 * the window locks at Saturday 12:00 PM. Once that Saturday-noon deadline for
 * a given target week passes, the window rolls forward to the following week
 * (whose own deadline is exactly 7 days later).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DHAKA_UTC_OFFSET_MINUTES = 6 * 60;

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

function atMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Today's date at 00:00. */
export function startOfToday(): Date {
  return atMidnight(new Date());
}

/** Monday (00:00) of the ISO week containing `date`. */
export function getMondayOfWeek(date: Date): Date {
  const d = atMidnight(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffFromMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffFromMonday);
  return d;
}

/** The same calendar date as `date`, expressed at UTC midnight. Week keys
 * (`weeklySchedule.weekStartDate`, `weeklyScheduleDay.date`) are stored this
 * way so RUN MAPPING / route-generation lookups never depend on the server's
 * timezone — every schedule-creating flow MUST pass its week through this
 * before writing to the database. */
export function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export type SubmissionWindow = {
  /** Monday of the Mon-Fri week currently open for submission. */
  weekStartDate: Date;
  /** Saturday 12:00 PM deadline for that week. */
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

  let candidateTargetMonday = new Date(thisMonday.getTime() + 7 * MS_PER_DAY);
  let deadline = new Date(thisMonday.getTime() + dayOffsetFromMonday * MS_PER_DAY);
  deadline.setHours(lockHour, lockMinute, 0, 0);

  if (now.getTime() > deadline.getTime()) {
    candidateTargetMonday = new Date(
      candidateTargetMonday.getTime() + 7 * MS_PER_DAY
    );
    deadline = new Date(deadline.getTime() + 7 * MS_PER_DAY);
  }

  return {
    weekStartDate: candidateTargetMonday,
    deadline,
    opensAt: new Date(deadline.getTime() - 7 * MS_PER_DAY),
    isOpen: now.getTime() <= deadline.getTime(),
  };
}

/** The 5 calendar dates (Mon-Fri) for a given week-start Monday. */
export function getWeekDays(weekStartDate: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Deterministic formatting (no locale/timezone) so server and client output
// identical strings and React hydration never mismatches.
export function formatShortDate(date: Date): string {
  const month = SHORT_MONTHS[date.getMonth()];
  return `${date.getDate()} ${month}`;
}
