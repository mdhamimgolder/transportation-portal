import { OfficeLocation } from "./enums";

/**
 * Office coordinates for the app's two office sites. Set by Facilities when
 * creating/editing a vehicle; the vehicle's office is the LAST destination of
 * every generated route. Route-planning logic resolves these server-side and
 * snapshots them onto RoutePlan.destinationLat/Lng at generation time.
 */
export interface OfficeCoords {
  lat: number;
  lng: number;
  name: string;
}

export const OFFICE_COORDINATES: Record<string, OfficeCoords> = {
  [OfficeLocation.REGNUM]: {
    lat: 23.770169283403114,
    lng: 90.40850694678669,
    name: "Regnum",
  },
  [OfficeLocation.SPECTRA]: {
    lat: 23.791842210827237,
    lng: 90.42123175893035,
    name: "Spectra",
  },
};

/** Resolve coordinates for an office name, defaulting to Regnum. */
export function officeCoordinatesFor(
  office: string | null | undefined
): OfficeCoords {
  if (office === OfficeLocation.SPECTRA)
    return OFFICE_COORDINATES[OfficeLocation.SPECTRA];
  return OFFICE_COORDINATES[OfficeLocation.REGNUM];
}

/** Normalize a free-text office value (empty/unknown → Regnum). */
export function normalizeOfficeLocation(
  office: string | null | undefined
): OfficeLocation {
  return office === OfficeLocation.SPECTRA
    ? OfficeLocation.SPECTRA
    : OfficeLocation.REGNUM;
}