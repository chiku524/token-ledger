import { ErpSyncAdapter } from "./accounting/erp";
import { QuickBooksSyncAdapter } from "./accounting/quickbooks";
import { XeroSyncAdapter } from "./accounting/xero";
import { CustodianSourceAdapter } from "./sources/custodian";
import { BitcoinChainAdapter, EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter } from "./sources/chain";
import { ExchangeSourceAdapter } from "./sources/exchange";
import type { AdapterDescriptor } from "./types";

export { AdapterNotImplementedError } from "./errors";
export { toJournalSyncBatch } from "./accounting/map";
export { ErpSyncAdapter } from "./accounting/erp";
export { QuickBooksSyncAdapter } from "./accounting/quickbooks";
export { XeroSyncAdapter } from "./accounting/xero";
export type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./accounting/types";
export { CustodianSourceAdapter } from "./sources/custodian";
export { BitcoinChainAdapter, EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter } from "./sources/chain";
export { ExchangeSourceAdapter } from "./sources/exchange";
export { adapterForConnection, ConnectionClosedError, pullReadOnly, statusAfterSyncFailure, SYNC_NOT_LIVE } from "./sync";
export type { ConnectionMode, ConnectionStatus, ReadOnlyConnection } from "./sync";
export type {
  AdapterDescriptor,
  ChainSourceAdapter,
  CustodianSourceAdapter as CustodianSourcePort,
  ExchangeSourceAdapter as ExchangeSourcePort,
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "./types";

const stubAdapters = [
  new EthereumChainAdapter(),
  new SolanaChainAdapter(),
  new PolygonChainAdapter(),
  new BitcoinChainAdapter(),
  new ExchangeSourceAdapter(),
  new CustodianSourceAdapter(),
  new XeroSyncAdapter(),
  new QuickBooksSyncAdapter(),
  new ErpSyncAdapter(),
];

export function listStubAdapters(): AdapterDescriptor[] {
  return stubAdapters.filter((adapter) => !adapter.implemented).map((adapter) => adapter.descriptor);
}

export function listLiveAdapters(): AdapterDescriptor[] {
  return stubAdapters.filter((adapter) => adapter.implemented).map((adapter) => adapter.descriptor);
}
