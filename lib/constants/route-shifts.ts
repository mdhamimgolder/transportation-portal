import { ARRIVAL_TIME_OPTIONS } from "./arrival-times";

export const SHIFT_KEYS = ["10PM", "11PM", "12AM-6AM"] as const;
export type ShiftKey = (typeof SHIFT_KEYS)[number];

export const SHIFT_LABELS: Record<ShiftKey, string> = {
  "10PM": "10 PM",
  "11PM": "11 PM",
  "12AM-6AM": "12 AM-6 AM",
};

export const PICKUP_SHIFT = "10 PM";

export type PinState = {
  vehicleId: string;
  shifts: ShiftKey[];
};

/**
 * Weekly schedules store `arrivalTime` as a 24-hour "HH:mm" value (see
 * lib/constants/arrival-times.ts). Route generation, vehicle pinning, and the
 * planner UI all talk in shifts. These two vocabularies must never drift, so
 * every mapping below is derived from ARRIVAL_TIME_OPTIONS rather than written
 * out by hand.
 */
const ARRIVAL_VALUES = ARRIVAL_TIME_OPTIONS.map((option) => option.value);

/** Which stored "HH:mm" arrival values belong to each shift. */
export const ARRIVAL_TIMES_BY_SHIFT: Record<ShiftKey, string[]> = {
  "10PM": ARRIVAL_VALUES.filter((value) => value === "22:00"),
  "11PM": ARRIVAL_VALUES.filter((value) => value === "23:00"),
  "12AM-6AM": ARRIVAL_VALUES.filter(
    (value) => value !== "22:00" && value !== "23:00"
  ),
};

/** "22:00" -> "10 PM". Route plans are stored and grouped by this label. */
export const LABEL_FOR_ARRIVAL_VALUE: Record<string, string> =
  Object.fromEntries(
    ARRIVAL_TIME_OPTIONS.map((option) => [
      option.value,
      // "10:00 PM" -> "10 PM"; RoutePlan.arrivalTime uses the short form.
      option.label.replace(":00", ""),
    ])
  );

/** Every late-night label, in chronological order ("12 AM" .. "6 AM"). */
export const LATE_NIGHT_LABELS: string[] = ARRIVAL_TIMES_BY_SHIFT[
  "12AM-6AM"
].map((value) => LABEL_FOR_ARRIVAL_VALUE[value]);

/** Which shift a stored "HH:mm" arrival value belongs to (null if unknown). */
export function shiftKeyForArrivalTime(
  arrivalTime: string | null | undefined
): ShiftKey | null {
  if (!arrivalTime) return null;
  for (const key of SHIFT_KEYS) {
    if (ARRIVAL_TIMES_BY_SHIFT[key].includes(arrivalTime)) return key;
  }
  return null;
}
