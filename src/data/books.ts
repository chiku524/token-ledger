import type { FxRate } from "@/ledger/fx";
import type { AssetPrice } from "@/ledger/pricing";
import type { ReconciliationOverride } from "./reconciliation";
import type { AccountType, PostedJournalEntry, QuantityDirection, Side } from "@/ledger";

export interface StoredJournalEntry extends PostedJournalEntry {
  postedBy: string;
  postedAt: string;
  reversesEntryId: string | null;
}

export interface BooksEntity {
  id: string;
  organizationId: string;
  name: string;
  jurisdiction: string;
  functionalCurrency: string;
  reportingFramework: string;
  parentEntityId: string | null;
}

export interface BooksAsset {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  chain: string | null;
  decimals: number;
  assetClass: "crypto" | "stablecoin" | "fiat";
}

export type ConnectionMode = "watch" | "exchange_read" | "custodian_read";
export type ConnectionStatus = "pending" | "healthy" | "degraded" | "revoked";

/** Read-only grant. Scopes are balances and movements. No secret is stored. */
export interface BooksConnection {
  id: string;
  organizationId: string;
  entityId: string;
  mode: ConnectionMode;
  venue: string;
  name: string;
  status: ConnectionStatus;
  scopes: string;
  cursor: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** ISO time a backed-off connection is next due. Null means due now. */
  nextAttemptAt: string | null;
}

export interface BooksSource {
  id: string;
  organizationId: string;
  entityId: string;
  connectionId: string | null;
  kind: "wallet" | "exchange" | "custodian";
  role: "hot" | "cold" | "staking" | null;
  name: string;
  chain: string | null;
  identifier: string;
}

/** Observed quantity at a moment. Separate from the journal. */
export interface BooksBalanceSnapshot {
  id: string;
  organizationId: string;
  entityId: string;
  sourceId: string;
  assetCode: string;
  quantityMinor: bigint;
  asOf: string;
}

export interface BooksAccount {
  id: string;
  organizationId: string;
  entityId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: Side;
  measurementBasis: string | null;
  ifrsNote: string;
}

export interface BooksSourceTransaction {
  id: string;
  organizationId: string;
  entityId: string;
  sourceId: string;
  externalId: string;
  occurredOn: string;
  assetCode: string;
  direction: QuantityDirection;
  quantityMinor: bigint;
  description: string;
}

export interface BooksReconciliation {
  id: string;
  organizationId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  status: "matched" | "exception";
  sourceId: string;
  assetCode: string;
  direction: QuantityDirection;
  quantityMinor: bigint;
  sourceTransactionId: string | null;
  journalEntryId: string | null;
  journalLineNumber: number | null;
  note: string;
}

export interface StoredFxRate extends FxRate {
  organizationId: string;
}

/** A stored market price. Same shape as the pure `AssetPrice`. */
export type StoredAssetPrice = AssetPrice;

export interface AuditEvent {
  id: string;
  organizationId: string;
  occurredAt: string;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  detail: string;
}

export interface Books {
  notice: string;
  period: { start: string; end: string; label: string };
  organization: { id: string; name: string; origin: "example" | "live" };
  entities: readonly BooksEntity[];
  assets: readonly BooksAsset[];
  connections: readonly BooksConnection[];
  sources: readonly BooksSource[];
  balanceSnapshots: readonly BooksBalanceSnapshot[];
  accounts: readonly BooksAccount[];
  journalEntries: readonly StoredJournalEntry[];
  sourceTransactions: readonly BooksSourceTransaction[];
  reconciliations: readonly BooksReconciliation[];
  /** Manual reconciliation decisions overlaid on the automatic matches. */
  reconciliationOverrides: readonly ReconciliationOverride[];
  fxRates: readonly StoredFxRate[];
  assetPrices: readonly StoredAssetPrice[];
  auditEvents: readonly AuditEvent[];
}
