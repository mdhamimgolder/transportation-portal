// Facilities picks the actual pickup time when assigning a route -- this can
// differ slightly from the employee's requested arrival time, so it's a
// broader range than the employee-facing dropdowns.

function to12Hour(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
}

export const PICKUP_TIME_OPTIONS: { value: string; label: string }[] = [];
for (let hour = 0; hour < 24; hour++) {
  for (const minute of [0, 30]) {
    const value = `${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}`;
    PICKUP_TIME_OPTIONS.push({ value, label: to12Hour(hour, minute) });
  }
}
