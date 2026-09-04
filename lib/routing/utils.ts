/**
 * Route generation utilities for advanced clustering and optimization
 */

/**
 * Chunk an array into equal-sized groups
 * @param arr - Array to chunk
 * @param chunkSize - Size of each chunk
 * @returns Array of chunks
 */
export function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Calculate great-circle distance between two coordinates (Haversine formula)
 * Useful for initial clustering before API calls
 * @param lat1 - First latitude
 * @param lng1 - First longitude
 * @param lat2 - Second latitude
 * @param lng2 - Second longitude
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Simple geographic clustering using Haversine distance
 * Groups locations that are close to each other
 * @param locations - Array of {lat, lng, id, name}
 * @param maxRadius - Maximum radius in km for cluster
 * @returns Array of clusters, each containing location indices
 */
export function clusterByDistance(
  locations: Array<{ lat: number; lng: number; id: string; name?: string }>,
  maxRadius: number = 2.0
): number[][] {
  const clusters: number[][] = [];
  const visited = new Set<number>();

  for (let i = 0; i < locations.length; i++) {
    if (visited.has(i)) continue;

    const cluster: number[] = [i];
    visited.add(i);

    for (let j = i + 1; j < locations.length; j++) {
      if (visited.has(j)) continue;

      const distance = haversineDistance(
        locations[i].lat,
        locations[i].lng,
        locations[j].lat,
        locations[j].lng
      );

      if (distance <= maxRadius) {
        cluster.push(j);
        visited.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Round-robin vehicle assignment for employee groups
 * Useful for simple load distribution
 * @param groups - Array of employee groups
 * @param vehicles - Available vehicles
 * @returns Array of {vehicleId, employees}
 */
export function roundRobinAssignment<T>(
  groups: T[][],
  vehicles: Array<{ id: string }>
): Array<{ vehicleId: string; employees: T[] }> {
  return groups.map((group, idx) => ({
    vehicleId: vehicles[idx % vehicles.length].id,
    employees: group,
  }));
}

/**
 * Time string utilities
 */
export function addMinutesToTime(timeStr: string, minutes: number): string {
  const [hours, mins] = timeStr.split(":").map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${String(newHours).padStart(2, "0")}:${String(newMins).padStart(2, "0")}`;
}

export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeString(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Parse arrival time string to shift category
 * @param arrivalTime - "10 PM", "11 PM", "12 AM", etc.
 * @returns Shift category
 */
export function parseArrivalTimeShift(
  arrivalTime: string
): "10PM" | "11PM" | "LATE_NIGHT" {
  const normalized = arrivalTime.toUpperCase().replace(/\s+/g, "");

  if (normalized === "10PM") return "10PM";
  if (normalized === "11PM") return "11PM";
  return "LATE_NIGHT"; // 12 AM - 6 AM
}

/**
 * Get departure time for a shift
 * @param shift - "10PM", "11PM", "LATE_NIGHT"
 * @returns Departure time in "HH:mm" format
 */
export function getDepartureTimeForShift(shift: string): string {
  switch (shift) {
    case "10PM":
      return "20:00"; // 8 PM
    case "11PM":
      return "20:45"; // 8:45 PM
    case "LATE_NIGHT":
      return "21:30"; // 9:30 PM (after rest from 11 PM run)
    default:
      return "20:00";
  }
}

/**
 * Calculate vehicle completion time given departure and total route duration
 * @param departureTime - Departure time "HH:mm"
 * @param durationMinutes - Total route duration in minutes
 * @returns Completion time as Date object (same day)
 */
export function calculateCompletionTime(
  departureTime: string,
  durationMinutes: number
): Date {
  const [hours, minutes] = departureTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const completionHours = Math.floor(totalMinutes / 60);
  const completionMins = totalMinutes % 60;

  const now = new Date();
  const completionTime = new Date(now);
  completionTime.setHours(completionHours, completionMins, 0, 0);

  return completionTime;
}
