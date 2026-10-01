/**
 * Custodian source adapters. Fireblocks is live and read-only; it needs a
 * user-supplied Viewer API key and an RSA private key, sealed at rest. The
 * generic `CustodianSourceAdapter` port remains for other providers (Copper,
 * BitGo, Anchorage) to implement later. See docs/adr-custodian-connectors.md.
 */
import type { ExchangeCredentialInput } from "../credentials/store";
import { AdapterNotImplementedError } from "../errors";
import type {
  AdapterDescriptor,
  CustodianSourceAdapter as CustodianSourcePort,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "../types";
import { FireblocksClient, type FireblocksClientOptions } from "./custodian/fireblocks-client";
import { FireblocksReader } from "./custodian/fireblocks-reader";
import { BitGoClient, type BitGoClientOptions } from "./custodian/bitgo-client";
import { BitGoReader } from "./custodian/bitgo-reader";

/** The generic port, still unimplemented for providers without a connector. */
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

export interface FireblocksCustodianAdapterOptions {
  credential?: ExchangeCredentialInput;
  reader?: FireblocksReader;
  clientOptions?: FireblocksClientOptions;
}

/**
 * Live read-only Fireblocks connector. One connection is one workspace; the
 * external account id is a vault account id.
 */
export class FireblocksCustodianAdapter implements CustodianSourcePort {
  readonly kind = "custodian" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor = {
    name: "Fireblocks",
    category: "custodian",
    system: "fireblocks",
    implemented: true,
    summary: "Read-only vault balances and transactions from Fireblocks. A Viewer API key is stored sealed; it cannot sign or move funds.",
  };
  private readonly options: FireblocksCustodianAdapterOptions;
  private cachedReader: FireblocksReader | null = null;

  constructor(options: FireblocksCustodianAdapterOptions = {}) {
    this.options = options;
  }

  /** Built lazily so listing adapters never requires a credential. */
  private get reader(): FireblocksReader {
    if (!this.cachedReader) {
      this.cachedReader =
        this.options.reader ?? new FireblocksReader(new FireblocksClient(requireCredential(this.options), this.options.clientOptions));
    }
    return this.cachedReader;
  }

  async fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    assertVault(query);
    return this.reader.fetchBalances();
  }

  async fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    const vaultAccountId = assertVault(query);
    return this.reader.fetchTransactions(vaultAccountId, query.since, query.until);
  }

  /** One connection covers a workspace; the vault account id is the listed account. */
  async listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    const vaultAccountId = assertVault(query);
    return [{ externalAccountId: vaultAccountId, name: `Fireblocks vault ${vaultAccountId}`, chain: undefined }];
  }
}

function requireCredential(options: FireblocksCustodianAdapterOptions): ExchangeCredentialInput {
  if (!options.credential) {
    throw new Error("A Fireblocks credential is required (Viewer API key and RSA private key).");
  }
  return options.credential;
}

function assertVault(query: FetchSourceTransactionsQuery): string {
  const id = query.externalAccountId?.trim();
  if (!id) {
    throw new Error("A Fireblocks vault account id is required.");
  }
  return id;
}

export interface BitGoCustodianAdapterOptions {
  credential?: ExchangeCredentialInput;
  reader?: BitGoReader;
  clientOptions?: BitGoClientOptions;
}

/**
 * Live read-only BitGo connector. One connection is one BitGo account
 * (access token); the external account id is a coin key such as `btc`, whose
 * wallets' transfers are read.
 */
export class BitGoCustodianAdapter implements CustodianSourcePort {
  readonly kind = "custodian" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor = {
    name: "BitGo",
    category: "custodian",
    system: "bitgo",
    implemented: true,
    summary: "Read-only wallet balances and transfers from BitGo. A view-only access token is stored sealed; it cannot sign or send.",
  };
  private readonly options: BitGoCustodianAdapterOptions;
  private cachedReader: BitGoReader | null = null;

  constructor(options: BitGoCustodianAdapterOptions = {}) {
    this.options = options;
  }

  private get reader(): BitGoReader {
    if (!this.cachedReader) {
      if (!this.options.reader) {
        if (!this.options.credential) {
          throw new Error("A BitGo access token is required.");
        }
        this.cachedReader = new BitGoReader(new BitGoClient(this.options.credential, this.options.clientOptions));
      } else {
        this.cachedReader = this.options.reader;
      }
    }
    return this.cachedReader;
  }

  async fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]> {
    assertCoin(query);
    return this.reader.fetchBalances();
  }

  async fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    const coin = assertCoin(query);
    return this.reader.fetchTransactions(coin, query.since, query.until);
  }

  /** One connection is the account; the coin key is the listed account. */
  async listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]> {
    const coin = assertCoin(query);
    return [{ externalAccountId: coin, name: `BitGo ${coin} wallets`, chain: undefined }];
  }
}

function assertCoin(query: FetchSourceTransactionsQuery): string {
  const coin = query.externalAccountId?.trim();
  if (!coin) {
    throw new Error("A BitGo coin key is required (for example btc).");
  }
  return coin;
}
