/**
 * Chain source adapters. Solana is live and read-only: it calls the public
 * JSON-RPC interface (or a private endpoint via SOLANA_RPC_URL) and never
 * signs. Ethereum and Polygon remain stubs until their epic lands.
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
import { SolanaReader } from "./solana/reader";
import { SolanaRpcClient } from "./solana/rpc";

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

export interface SolanaChainAdapterOptions {
  reader?: SolanaReader;
  client?: SolanaRpcClient;
}

export class SolanaChainAdapter implements ChainSourceAdapter {
  readonly kind = "chain" as const;
  readonly chain = "solana";
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor = {
    name: "Solana wallets",
    category: "chain",
    system: "Solana",
    implemented: true,
    summary: "Read-only balances and transfers on Solana, including SPL tokens. No key is stored.",
  };
  private readonly reader: SolanaReader;

  constructor(options: SolanaChainAdapterOptions = {}) {
    this.reader = options.reader ?? new SolanaReader(options.client ?? new SolanaRpcClient());
  }

  async fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    return this.reader.fetchTransactions(this.address(query), query.since, query.until);
  }

  async fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    return this.reader.fetchBalances(this.address(query));
  }

  /** One connection covers one address. The address itself is the listed account. */
  async listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    const address = this.address(query);
    return [{ externalAccountId: address, name: "Solana account", chain: "solana" }];
  }

  private address(query: FetchSourceTransactionsQuery): string {
    const address = query.externalAccountId?.trim();
    if (!address) {
      throw new Error("A Solana address is required.");
    }
    return address;
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
