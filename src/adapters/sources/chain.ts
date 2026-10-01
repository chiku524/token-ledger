/**
 * Chain source adapters. All three are live and read-only: they call JSON-RPC
 * over https (or a private endpoint via env) and never sign. Solana uses its
 * own reader; Ethereum and Polygon share the EVM reader.
 */
import type {
  AdapterDescriptor,
  ChainSourceAdapter,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "../types";
import { evmChain, type EvmChain } from "./evm/chains";
import { EvmReader } from "./evm/reader";
import { EvmRpcClient, type EvmRpcClientOptions } from "./evm/rpc";
import { SolanaReader } from "./solana/reader";
import { SolanaRpcClient } from "./solana/rpc";

export interface EvmChainAdapterOptions {
  reader?: EvmReader;
  rpc?: EvmRpcClientOptions;
}

class EvmChainAdapter implements ChainSourceAdapter {
  readonly kind = "chain" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor;
  private readonly spec: EvmChain;
  private readonly reader: EvmReader;

  constructor(spec: EvmChain, name: string, options: EvmChainAdapterOptions = {}) {
    this.spec = spec;
    this.descriptor = {
      name,
      category: "chain",
      system: spec.name,
      implemented: true,
      summary: `Read-only ${spec.nativeCode} and ERC-20 balances and transfers on ${spec.name}. No key is stored.`,
    };
    this.reader = options.reader ?? new EvmReader(spec, new EvmRpcClient(spec, options.rpc));
  }

  get chain(): string {
    return this.spec.key;
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
    return [{ externalAccountId: address, name: `${this.spec.name} account`, chain: this.spec.key }];
  }

  private address(query: FetchSourceTransactionsQuery): string {
    const address = query.externalAccountId?.trim();
    if (!address) {
      throw new Error(`An ${this.spec.name} address is required.`);
    }
    return address;
  }
}

export class EthereumChainAdapter extends EvmChainAdapter {
  constructor(options: EvmChainAdapterOptions = {}) {
    super(evmChain("ethereum")!, "Ethereum wallets", options);
  }
}

export class PolygonChainAdapter extends EvmChainAdapter {
  constructor(options: EvmChainAdapterOptions = {}) {
    super(evmChain("polygon")!, "Polygon wallets", options);
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
