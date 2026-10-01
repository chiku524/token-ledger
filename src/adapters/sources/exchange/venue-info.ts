/**
 * Venue metadata for the frontend. Reads the registry, so import it only from
 * server code (the connection form is a server component).
 */
import { VENUES } from "./registry";

export interface VenueInfo {
  key: string;
  label: string;
  keyUrl: string;
  scopes: string[];
}

export function listVenues(): VenueInfo[] {
  return Object.values(VENUES).map((venue) => ({
    key: venue.key,
    label: venue.label,
    keyUrl: venue.keyUrl,
    scopes: venue.scopes,
  }));
}

export function venueInfo(key: string): VenueInfo | null {
  const venue = VENUES[key];
  if (!venue) return null;
  return { key: venue.key, label: venue.label, keyUrl: venue.keyUrl, scopes: venue.scopes };
}
