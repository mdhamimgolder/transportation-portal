// Ad-hoc requests are for same-day emergency transport, covering the overnight
// window from 10:00 PM tonight through 6:00 AM the next morning -- this window
// is available every day of the week (no weekday/deadline restriction, unlike
// the Weekly form's Mon-Fri + Saturday-noon lock).

function to12Hour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

// Whole hours only, in overnight order: 10 PM, 11 PM, then 12 AM..6 AM
const OVERNIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6];

export const ADHOC_ARRIVAL_TIME_OPTIONS: { value: string; label: string }[] =
  OVERNIGHT_HOURS.map((hour) => ({
    value: `${hour.toString().padStart(2, "0")}:00`,
    label: to12Hour(hour),
  }));
