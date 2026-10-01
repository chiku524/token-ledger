/**
 * Exchange source adapters. Kraken is live and read-only; it needs a
 * user-supplied read-only credential, which is sealed at rest. The generic
 * `ExchangeSourceAdapter` port remains for other venues (Bybit, Binance,
 * Gate.io, Backpack) to implement later. See docs/adr-exchange-connectors.md.
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
import { KrakenClient, type KrakenClientOptions } from "./exchange/kraken-client";
import { KrakenReader } from "./exchange/kraken-reader";

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

export interface KrakenExchangeAdapterOptions {
  credential?: ExchangeCredentialInput;
  client?: KrakenClient;
  clientOptions?: KrakenClientOptions;
}

/**
 * Live read-only Kraken connector. One connection covers the whole account, so
 * the external account id is a label, not a per-asset address.
 */
export class KrakenExchangeAdapter implements ExchangeSourcePort {
  readonly kind = "exchange" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor = {
    name: "Kraken",
    category: "exchange",
    system: "kraken",
    implemented: true,
    summary: "Read-only balances, deposits, withdrawals, and trades from a Kraken account. A read-only API key is stored sealed; it cannot trade or withdraw.",
  };
  private readonly options: KrakenExchangeAdapterOptions;
  private cachedReader: KrakenReader | null = null;

  constructor(options: KrakenExchangeAdapterOptions = {}) {
    this.options = options;
  }

  /** Built lazily so listing adapters never requires a credential. */
  private get reader(): KrakenReader {
    if (!this.cachedReader) {
      const client = this.options.client ?? new KrakenClient(requireCredential(this.options), this.options.clientOptions);
      this.cachedReader = new KrakenReader(client);
    }
    return this.cachedReader;
  }

  async fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    assertAccount(query);
    return this.reader.fetchBalances();
  }

  async fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    assertAccount(query);
    return this.reader.fetchTransactions(query.since, query.until);
  }

  /** One connection is the whole account; there is a single listed account. */
  async listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    return [{ externalAccountId: query.externalAccountId?.trim() || "kraken-account", name: "Kraken account", chain: "kraken" }];
  }
}

function requireCredential(options: KrakenExchangeAdapterOptions): ExchangeCredentialInput {
  if (!options.credential) {
    throw new Error("A Kraken credential is required (read-only API key and secret).");
  }
  return options.credential;
}

function assertAccount(query: FetchSourceTransactionsQuery): void {
  if (!query.externalAccountId?.trim()) {
    throw new Error("A Kraken account reference is required.");
  }
}
