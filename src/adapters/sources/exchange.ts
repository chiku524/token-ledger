/**
 * Exchange source adapters. Any venue in the registry is live and read-only
 * through one generic adapter; each venue supplies a read-only connector and
 * needs a user-supplied credential that is sealed at rest.
 * See docs/adr-exchange-connectors.md.
 */
import type { ExchangeCredentialInput } from "../credentials/store";
import { AdapterNotImplementedError } from "../errors";
import type {
  AdapterDescriptor,
  ExchangeSourceAdapter as ExchangeSourcePort,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "../types";
import { createVenueConnector, VENUES } from "./exchange/registry";
import { listAccountsFor, type VenueConnector, type VenueDefinition } from "./exchange/venue";

/** The generic port, still unimplemented for venues without a connector. */
export class ExchangeSourceAdapter implements ExchangeSourcePort {
  readonly kind = "exchange" as const;
  readonly implemented = false as const;
  readonly descriptor: AdapterDescriptor = {
    name: "Exchanges",
    category: "exchange",
    system: "exchange",
    implemented: false,
    summary: "Balances, trades, deposits, and withdrawals. Not connected yet.",
  };

  fetchTransactions(_query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    return Promise.reject(new AdapterNotImplementedError(this.descriptor.name));
  }

  fetchBalances(_query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    return Promise.reject(new AdapterNotImplementedError(this.descriptor.name));
  }

  listAccounts(_query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    return Promise.reject(new AdapterNotImplementedError(this.descriptor.name));
  }
}

export interface VenueExchangeAdapterOptions {
  credential?: ExchangeCredentialInput;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Test seam: supply a connector directly instead of building one. */
  connector?: VenueConnector;
}

/**
 * Live read-only exchange connector for any registered venue. One connection
 * covers the whole account.
 */
export class VenueExchangeAdapter implements ExchangeSourcePort {
  readonly kind = "exchange" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor;
  private readonly options: VenueExchangeAdapterOptions;
  private cachedConnector: ReturnType<typeof createVenueConnector> | null = null;

  constructor(private readonly venue: VenueDefinition, options: VenueExchangeAdapterOptions = {}) {
    this.options = options;
    this.descriptor = {
      name: venue.label,
      category: "exchange",
      system: venue.key,
      implemented: true,
      summary: `${venue.summary} A read-only API key is stored sealed; it cannot trade or withdraw.`,
    };
  }

  /** Built lazily so listing adapters never requires a credential. */
  private get connector(): VenueConnector {
    if (!this.cachedConnector) {
      if (this.options.connector) {
        this.cachedConnector = this.options.connector;
        return this.cachedConnector;
      }
      if (!this.options.credential) {
        throw new Error(`A ${this.venue.label} credential is required (read-only API key and secret).`);
      }
      this.cachedConnector = createVenueConnector(this.venue.key, this.options.credential, {
        baseUrl: this.options.baseUrl,
        fetchImpl: this.options.fetchImpl,
      });
    }
    return this.cachedConnector;
  }

  async fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    assertAccount(this.venue, query);
    return this.connector.fetchBalances();
  }

  async fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    assertAccount(this.venue, query);
    return this.connector.fetchTransactions(query.since, query.until);
  }

  async listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    return listAccountsFor(this.venue.label, query.externalAccountId);
  }
}

/**
 * Backwards-compatible Kraken adapter alias. Prefer creating adapters through
 * the registry. Kept so existing imports still resolve.
 */
export class KrakenExchangeAdapter extends VenueExchangeAdapter {
  constructor(options: VenueExchangeAdapterOptions = {}) {
    super(VENUES.kraken!, options);
  }
}

function assertAccount(venue: VenueDefinition, query: FetchSourceTransactionsQuery): void {
  if (!query.externalAccountId?.trim()) {
    throw new Error(`A ${venue.label} account reference is required.`);
  }
}

export { VENUES, VENUE_KEYS, venueDefinition, createVenueConnector } from "./exchange/registry";
export { listVenues, venueInfo, type VenueInfo } from "./exchange/venue-info";
