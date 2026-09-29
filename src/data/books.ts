import type { FxRate } from "@/ledger/fx";
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

export interface BooksSource {
  id: string;
  organizationId: string;
  entityId: string;
  kind: "wallet" | "exchange" | "custodian";
  role: "hot" | "cold" | "staking" | null;
  name: string;
  chain: string | null;
  identifier: string;
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
  sources: readonly BooksSource[];
  accounts: readonly BooksAccount[];
  journalEntries: readonly StoredJournalEntry[];
  sourceTransactions: readonly BooksSourceTransaction[];
  reconciliations: readonly BooksReconciliation[];
  fxRates: readonly StoredFxRate[];
  auditEvents: readonly AuditEvent[];
}
