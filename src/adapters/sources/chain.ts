/**
 * STUB chain adapters. No RPC, no indexer, no API key.
 * Ethereum, Solana, and Polygon are the first chains the product names.
 * Replace `fetchTransactions` with a real client when a source is ready.
 */
import { AdapterNotImplementedError } from "../errors";
import type {
  AdapterDescriptor,
  ChainSourceAdapter,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "../types";

function chainDescriptor(chain: string, name: string): AdapterDescriptor {
  return {
    name,
    category: "chain",
    system: chain,
    implemented: false,
    summary: `Balances and transfers on ${chain}. Not connected yet.`,
  };
}

function reject(name: string, _query: FetchSourceTransactionsQuery): Promise<never> {
  return Promise.reject(new AdapterNotImplementedError(name));
}

export class EthereumChainAdapter implements ChainSourceAdapter {
  readonly kind = "chain" as const;
  readonly chain = "ethereum";
  readonly implemented = false as const;
  readonly descriptor = chainDescriptor("Ethereum", "Ethereum wallets");

  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    return reject(this.descriptor.name, query);
  }

  fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    return reject(this.descriptor.name, query);
  }

  listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    return reject(this.descriptor.name, query);
  }
}

export class SolanaChainAdapter implements ChainSourceAdapter {
  readonly kind = "chain" as const;
  readonly chain = "solana";
  readonly implemented = false as const;
  readonly descriptor = chainDescriptor("Solana", "Solana wallets");

  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    return reject(this.descriptor.name, query);
  }

  fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    return reject(this.descriptor.name, query);
  }

  listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    return reject(this.descriptor.name, query);
  }
}

export class PolygonChainAdapter implements ChainSourceAdapter {
  readonly kind = "chain" as const;
  readonly chain = "polygon";
  readonly implemented = false as const;
  readonly descriptor = chainDescriptor("Polygon", "Polygon wallets");

  fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    return reject(this.descriptor.name, query);
  }

  fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    return reject(this.descriptor.name, query);
  }

  listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    return reject(this.descriptor.name, query);
  }
}
