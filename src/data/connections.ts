import type { BooksConnection, BooksSource, ConnectionMode } from "./books";

/** The only scopes a connection may hold. Withdraw, trade, and sign are refused. */
export const READ_ONLY_SCOPES = "balances,movements";

const WATCH_VENUES = ["ethereum", "solana", "polygon"] as const;
const EXCHANGE_VENUES = ["kraken", "exchange"] as const;

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
}): ConnectionDraft {
  const shared = {
    entityId: input.entityId,
    name: input.name,
    status: "pending" as const,
    scopes: READ_ONLY_SCOPES,
  };
  if (input.mode === "watch") {
    const venue = input.chain ?? "";
    if (!WATCH_VENUES.includes(venue as (typeof WATCH_VENUES)[number])) {
      throw new Error("Choose Ethereum, Solana, or Polygon.");
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
  return {
    connection: { ...shared, mode: "custodian_read", venue: "custodian", scopes: READ_ONLY_SCOPES },
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
