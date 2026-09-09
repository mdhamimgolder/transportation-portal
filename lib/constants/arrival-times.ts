export const NO_TRANSPORT_VALUE = "NONE";

function to12Hour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

// Whole hours only, overnight window: 10 PM through 6 AM.
const HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6];

export const ARRIVAL_TIME_OPTIONS: { value: string; label: string }[] = HOURS.map(
  (hour) => ({
    value: `${hour.toString().padStart(2, "0")}:00`,
    label: to12Hour(hour),
  })
);

export function normalizeArrivalTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase() === "not required" || trimmed.toUpperCase() === NO_TRANSPORT_VALUE) {
    return NO_TRANSPORT_VALUE;
  }

  const exactMatch = ARRIVAL_TIME_OPTIONS.find(
    (option) => option.value === trimmed || option.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (exactMatch) return exactMatch.value;

  const twelveHourMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (twelveHourMatch) {
    const hour = Number(twelveHourMatch[1]);
    const minute = Number(twelveHourMatch[2] ?? "0");
    const period = twelveHourMatch[3].toLowerCase();

    let hour24 = hour % 12;
    if (period === "pm") hour24 += 12;
    if (hour === 12 && period === "am") hour24 = 0;

    const totalMinutes = hour24 * 60 + minute;
    const normalizedHour = Math.floor(totalMinutes / 60) % 24;
    return `${normalizedHour.toString().padStart(2, "0")}:00`;
  }

  const twentyFourHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hour = Number(twentyFourHourMatch[1]);
    const minute = Number(twentyFourHourMatch[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    const normalizedHour = Math.floor((hour * 60 + minute) / 60) % 24;
    return `${normalizedHour.toString().padStart(2, "0")}:00`;
  }

  return null;
}
