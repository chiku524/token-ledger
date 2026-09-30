/**
 * STUB exchange adapter. No exchange SDK and no API key.
 * A live implementation should normalize fills, withdrawals, and deposits
 * into NormalizedSourceTransaction for one venue at a time.
 */
import { AdapterNotImplementedError } from "../errors";
import type {
  AdapterDescriptor,
  ExchangeSourceAdapter as ExchangeSourcePort,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "../types";

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
