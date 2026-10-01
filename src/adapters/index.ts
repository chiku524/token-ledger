import { ErpSyncAdapter } from "./accounting/erp";
import { QuickBooksSyncAdapter } from "./accounting/quickbooks";
import { XeroSyncAdapter } from "./accounting/xero";
import { CustodianSourceAdapter } from "./sources/custodian";
import { BitcoinChainAdapter, EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter, SuiChainAdapter } from "./sources/chain";
import { ExchangeSourceAdapter, VenueExchangeAdapter } from "./sources/exchange";
import { VENUES } from "./sources/exchange/registry";
import type { AdapterDescriptor } from "./types";

export { AdapterNotImplementedError } from "./errors";
export { toJournalSyncBatch } from "./accounting/map";
export { ErpSyncAdapter } from "./accounting/erp";
export { QuickBooksSyncAdapter } from "./accounting/quickbooks";
export { XeroSyncAdapter } from "./accounting/xero";
export type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./accounting/types";
export { CustodianSourceAdapter } from "./sources/custodian";
export { BitcoinChainAdapter, EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter, SuiChainAdapter } from "./sources/chain";
export { ExchangeSourceAdapter, KrakenExchangeAdapter, VenueExchangeAdapter } from "./sources/exchange";
export { VENUES, VENUE_KEYS, venueDefinition, createVenueConnector } from "./sources/exchange/registry";
export { listVenues, venueInfo } from "./sources/exchange/venue-info";
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
  new SuiChainAdapter(),
  new ExchangeSourceAdapter(),
  ...Object.values(VENUES).map((venue) => new VenueExchangeAdapter(venue)),
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
