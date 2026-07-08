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
