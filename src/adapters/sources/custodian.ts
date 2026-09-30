/**
 * STUB custodian adapter. No custodian SDK and no API key.
 * A live implementation should read vault movements for a named custodian.
 */
import { AdapterNotImplementedError } from "../errors";
import type {
  AdapterDescriptor,
  CustodianSourceAdapter as CustodianSourcePort,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "../types";

export class CustodianSourceAdapter implements CustodianSourcePort {
  readonly kind = "custodian" as const;
  readonly implemented = false as const;
  readonly descriptor: AdapterDescriptor = {
    name: "Custodians",
    category: "custodian",
    system: "custodian",
    implemented: false,
    summary: "Vault balances and transfers. Not connected yet.",
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
