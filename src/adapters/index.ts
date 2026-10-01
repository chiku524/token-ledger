import { ErpSyncAdapter } from "./accounting/erp";
import { QuickBooksSyncAdapter } from "./accounting/quickbooks";
import { XeroSyncAdapter } from "./accounting/xero";
import { BitGoCustodianAdapter, CustodianSourceAdapter, FireblocksCustodianAdapter } from "./sources/custodian";
import { BitcoinChainAdapter, EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter, SuiChainAdapter } from "./sources/chain";
import { ExchangeSourceAdapter, VenueExchangeAdapter } from "./sources/exchange";
import { VENUES } from "./sources/exchange/registry";
import type { AdapterDescriptor } from "./types";

export { AdapterNotImplementedError } from "./errors";
export { toJournalSyncBatch } from "./accounting/map";
export { idempotencyKeyFor } from "./accounting/types";
export { buildXeroAuthorizeUrl, exchangeXeroCode, listXeroConnections, refreshXeroToken, XERO_SCOPES } from "./accounting/xero-client";
export { buildQboAuthorizeUrl, exchangeQboCode, refreshQboToken, QBO_SCOPES } from "./accounting/quickbooks-client";
export { InMemoryErpClient, type ErpClient } from "./accounting/erp";
export { ErpSyncAdapter } from "./accounting/erp";
export { QuickBooksSyncAdapter } from "./accounting/quickbooks";
export { XeroSyncAdapter } from "./accounting/xero";
export type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./accounting/types";
export { BitGoCustodianAdapter, CustodianSourceAdapter, FireblocksCustodianAdapter } from "./sources/custodian";
export { BitcoinChainAdapter, EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter, SuiChainAdapter } from "./sources/chain";
export { ExchangeSourceAdapter, KrakenExchangeAdapter, VenueExchangeAdapter } from "./sources/exchange";
export { VENUES, VENUE_KEYS, venueDefinition, createVenueConnector } from "./sources/exchange/registry";
export { listVenues, venueInfo } from "./sources/exchange/venue-info";
export { CUSTODIANS, CUSTODIAN_KEYS, custodianDefinition } from "./sources/custodian/registry";
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
  new FireblocksCustodianAdapter(),
  new BitGoCustodianAdapter(),
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
