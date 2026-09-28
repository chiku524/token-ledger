import type { QuantityDirection } from "@/ledger";

export interface AdapterDescriptor {
  name: string;
  category: "chain" | "exchange" | "custodian" | "accounting";
  system: string;
  implemented: false;
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

export interface ChainSourceAdapter {
  readonly kind: "chain";
  readonly chain: string;
  readonly implemented: false;
  readonly descriptor: AdapterDescriptor;
  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]>;
}

export interface ExchangeSourceAdapter {
  readonly kind: "exchange";
  readonly implemented: false;
  readonly descriptor: AdapterDescriptor;
  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]>;
}

export interface CustodianSourceAdapter {
  readonly kind: "custodian";
  readonly implemented: false;
  readonly descriptor: AdapterDescriptor;
  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]>;
}
