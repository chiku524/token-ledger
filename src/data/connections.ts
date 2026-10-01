import type { BooksConnection, BooksSource, ConnectionMode } from "./books";

/** The only scopes a connection may hold. Withdraw, trade, and sign are refused. */
export const READ_ONLY_SCOPES = "balances,movements";

/**
 * Every chain a watch-only connection can read. This is the one place the list
 * lives; the form, the validator, and the sync resolver all read it, so a chain
 * cannot be added to the adapter layer and left unreachable from the app.
 */
export const WATCH_VENUES = [
  { key: "ethereum", label: "Ethereum" },
  { key: "solana", label: "Solana" },
  { key: "polygon", label: "Polygon" },
  { key: "bitcoin", label: "Bitcoin" },
  { key: "sui", label: "Sui" },
] as const;

export const WATCH_VENUE_KEYS = WATCH_VENUES.map((venue) => venue.key) as readonly string[];

export function watchVenueLabel(key: string): string {
  return WATCH_VENUES.find((venue) => venue.key === key)?.label ?? key;
}

/** Human list for validation messages, e.g. "Ethereum, Solana, Polygon, Bitcoin, Sui". */
export const WATCH_CHAIN_LABELS = WATCH_VENUES.map((venue) => venue.label).join(", ");

const EXCHANGE_VENUES = ["kraken", "bybit", "binance", "gate", "backpack", "exchange"] as const;
const CUSTODIAN_VENUES = ["fireblocks", "custodian"] as const;

export interface ConnectionDraft {
  connection: {
    entityId: string;
    mode: ConnectionMode;
    venue: string;
    name: string;
    status: "pending";
    scopes: typeof READ_ONLY_SCOPES;
  };
  source: {
    entityId: string;
    kind: BooksSource["kind"];
    role: BooksSource["role"];
    name: string;
    chain: string | null;
    identifier: string;
  };
}

export function connectionFromForm(input: {
  entityId: string;
  mode: ConnectionMode;
  name: string;
  chain: string | null;
  role: BooksSource["role"];
  identifier: string;
  exchangeVenue?: string | null;
  custodianVenue?: string | null;
}): ConnectionDraft {
  const shared = {
    entityId: input.entityId,
    name: input.name,
    status: "pending" as const,
    scopes: READ_ONLY_SCOPES,
  };
  if (input.mode === "watch") {
    const venue = input.chain ?? "";
    if (!WATCH_VENUE_KEYS.includes(venue)) {
      throw new Error(`Choose a supported chain: ${WATCH_VENUES.map((item) => item.label).join(", ")}.`);
    }
    return {
      connection: { ...shared, mode: "watch", venue, scopes: READ_ONLY_SCOPES },
      source: {
        entityId: input.entityId,
        kind: "wallet",
        role: input.role,
        name: input.name,
        chain: venue,
        identifier: input.identifier,
      },
    };
  }
  if (input.mode === "exchange_read") {
    const venue = input.exchangeVenue ?? "exchange";
    if (!EXCHANGE_VENUES.includes(venue as (typeof EXCHANGE_VENUES)[number])) {
      throw new Error("Choose an exchange.");
    }
    return {
      connection: { ...shared, mode: "exchange_read", venue, scopes: READ_ONLY_SCOPES },
      source: {
        entityId: input.entityId,
        kind: "exchange",
        role: null,
        name: input.name,
        chain: null,
        identifier: input.identifier,
      },
    };
  }
  const venue = input.custodianVenue ?? "custodian";
  if (!CUSTODIAN_VENUES.includes(venue as (typeof CUSTODIAN_VENUES)[number])) {
    throw new Error("Choose a custodian.");
  }
  return {
    connection: { ...shared, mode: "custodian_read", venue, scopes: READ_ONLY_SCOPES },
    source: {
      entityId: input.entityId,
      kind: "custodian",
      role: null,
      name: input.name,
      chain: input.chain,
      identifier: input.identifier,
    },
  };
}

export function sourcesForConnection(sources: readonly BooksSource[], connection: Pick<BooksConnection, "id">): BooksSource[] {
  return sources.filter((source) => source.connectionId === connection.id);
}
