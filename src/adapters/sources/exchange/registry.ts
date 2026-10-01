/**
 * Exchange venue registry. Each venue exports a `VenueDefinition`; the generic
 * exchange adapter and the connection UI both read from here, so adding a venue
 * is one module plus one entry.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import { krakenVenue } from "./venues/kraken";
import { bybitVenue } from "./venues/bybit";
import { binanceVenue } from "./venues/binance";
import { gateVenue } from "./venues/gate";
import { backpackVenue } from "./venues/backpack";
import type { VenueConnector, VenueDefinition } from "./venue";

export const VENUES: Record<string, VenueDefinition> = {
  kraken: krakenVenue,
  bybit: bybitVenue,
  binance: binanceVenue,
  gate: gateVenue,
  backpack: backpackVenue,
};

export const VENUE_KEYS = Object.keys(VENUES);

export function isVenueKey(value: string): boolean {
  return value in VENUES;
}

export function venueDefinition(key: string): VenueDefinition | null {
  return VENUES[key] ?? null;
}

export function createVenueConnector(
  key: string,
  credential: ExchangeCredentialInput,
  options?: { baseUrl?: string; fetchImpl?: typeof fetch },
): VenueConnector {
  const venue = VENUES[key];
  if (!venue) throw new Error(`Unknown exchange "${key}".`);
  return venue.create(credential, options);
}
