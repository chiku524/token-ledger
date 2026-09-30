/**
 * Read-only pull for one connection. Live adapters throw before any network call.
 * A revoked connection is not read. Success is left to the caller to store.
 */
import { AdapterNotImplementedError } from "./errors";
import { CustodianSourceAdapter } from "./sources/custodian";
import { EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter } from "./sources/chain";
import { ExchangeSourceAdapter } from "./sources/exchange";
import type {
  ChainSourceAdapter,
  CustodianSourceAdapter as CustodianSourcePort,
  ExchangeSourceAdapter as ExchangeSourcePort,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "./types";

export type ConnectionMode = "watch" | "exchange_read" | "custodian_read";
export type ConnectionStatus = "pending" | "healthy" | "degraded" | "revoked";

export interface ReadOnlyConnection {
  mode: ConnectionMode;
  venue: string;
  status: ConnectionStatus;
}

export type SourceReader = ChainSourceAdapter | ExchangeSourcePort | CustodianSourcePort;

export const SYNC_NOT_LIVE = "This connector is not live yet. No request was sent.";

export class ConnectionClosedError extends Error {
  constructor() {
    super("This connection is disconnected.");
    this.name = "ConnectionClosedError";
  }
}

export function adapterForConnection(connection: Pick<ReadOnlyConnection, "mode" | "venue">): SourceReader | null {
  if (connection.mode === "watch" && connection.venue === "ethereum") return new EthereumChainAdapter();
  if (connection.mode === "watch" && connection.venue === "solana") return new SolanaChainAdapter();
  if (connection.mode === "watch" && connection.venue === "polygon") return new PolygonChainAdapter();
  if (connection.mode === "exchange_read" && connection.venue === "exchange") return new ExchangeSourceAdapter();
  if (connection.mode === "custodian_read" && connection.venue === "custodian") return new CustodianSourceAdapter();
  return null;
}

/** A failed read after a successful one is degraded. A first failure stays pending. */
export function statusAfterSyncFailure(status: ConnectionStatus): ConnectionStatus {
  if (status === "healthy" || status === "degraded") return "degraded";
  return status;
}

export async function pullReadOnly(
  connection: ReadOnlyConnection,
  externalAccountId: string,
  since: string,
): Promise<{ balances: NormalizedBalance[]; movements: NormalizedSourceTransaction[]; accounts: ListedAccount[] }> {
  if (connection.status === "revoked") {
    throw new ConnectionClosedError();
  }
  const adapter = adapterForConnection(connection);
  if (!adapter) {
    throw new AdapterNotImplementedError(connection.venue);
  }
  const query: FetchSourceTransactionsQuery = { since, externalAccountId };
  const balances = await adapter.fetchBalances(query);
  const movements = await adapter.fetchTransactions(query);
  const accounts = await adapter.listAccounts(query);
  return { balances, movements, accounts };
}
