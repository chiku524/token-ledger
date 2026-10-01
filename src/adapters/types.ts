import type { QuantityDirection } from "@/ledger";

export interface AdapterDescriptor {
  name: string;
  category: "chain" | "exchange" | "custodian" | "accounting";
  system: string;
  implemented: boolean;
  summary: string;
}

export interface FetchSourceTransactionsQuery {
  /** Inclusive accounting date, YYYY-MM-DD. */
  since: string;
  /** Inclusive accounting date, YYYY-MM-DD. */
  until?: string;
  /** Address, exchange account id, or custodian vault id. The caller supplies it. */
  externalAccountId?: string;
}

/** Shape a live chain, exchange, or custodian adapter should return. */
export interface NormalizedSourceTransaction {
  externalId: string;
  occurredOn: string;
  assetCode: string;
  direction: QuantityDirection;
  quantityMinor: bigint;
  description: string;
  chain?: string;
}

/** Observed holding. Zero is a real observation. This is not a journal balance. */
export interface NormalizedBalance {
  assetCode: string;
  quantityMinor: bigint;
  /** ISO-8601 time the venue reported this quantity. */
  asOf: string;
}

/** Address, sub-account, or vault discovered under one read-only grant. */
export interface ListedAccount {
  externalAccountId: string;
  name: string;
  chain?: string;
}

export interface ChainSourceAdapter {
  readonly kind: "chain";
  readonly chain: string;
  readonly implemented: boolean;
  readonly descriptor: AdapterDescriptor;
  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]>;
  fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]>;
  listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]>;
}

export interface ExchangeSourceAdapter {
  readonly kind: "exchange";
  readonly implemented: boolean;
  readonly descriptor: AdapterDescriptor;
  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]>;
  fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]>;
  listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]>;
}

export interface CustodianSourceAdapter {
  readonly kind: "custodian";
  readonly implemented: false;
  readonly descriptor: AdapterDescriptor;
  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]>;
  fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]>;
  listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]>;
}
