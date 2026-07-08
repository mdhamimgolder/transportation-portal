/**
 * Weekly submission window logic.
 *
 * Rule (PRD 4.2): employees submit a Mon-Fri schedule for the *upcoming* week;
 * the window locks at Saturday 12:00 PM. Once that Saturday-noon deadline for
 * a given target week passes, the window rolls forward to the following week
 * (whose own deadline is exactly 7 days later).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

export type SubmissionWindow = {
  /** Monday of the Mon-Fri week currently open for submission. */
  weekStartDate: Date;
  /** Saturday 12:00 PM deadline for that week. */
  deadline: Date;
  isOpen: boolean;
};

export function getSubmissionWindow(now: Date = new Date()): SubmissionWindow {
  const thisMonday = getMondayOfWeek(now);

  let candidateTargetMonday = new Date(thisMonday.getTime() + 7 * MS_PER_DAY);
  let deadline = new Date(thisMonday.getTime() + 5 * MS_PER_DAY);
  deadline.setHours(12, 0, 0, 0);

  if (now.getTime() > deadline.getTime()) {
    candidateTargetMonday = new Date(
      candidateTargetMonday.getTime() + 7 * MS_PER_DAY
    );
    deadline = new Date(deadline.getTime() + 7 * MS_PER_DAY);
  }

  return {
    weekStartDate: candidateTargetMonday,
    deadline,
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

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
