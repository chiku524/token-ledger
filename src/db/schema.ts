/**
 * Token Ledger domain model, stored in Postgres.
 *
 * Organizations hold legal entities (Malaysia / Singapore first). Each entity
 * has sources (wallet, exchange, custodian), a chart of accounts, and a
 * double-entry journal. Source transactions are the external facts. Reconciliation
 * records tie those facts to journal lines.
 *
 * Monetary and token amounts are bigint minor units. Posted journals must be
 * built with `postJournalEntry` before insert — the database stores the lines,
 * and the ledger module enforces debits = credits.
 *
 * Measurement bases on the chart (IAS 38, IAS 2, IFRS 9, IFRS 13) are labels
 * for reporting. They are not an accounting-policy opinion.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const dataOrigin = pgEnum("data_origin", ["example", "live"]);
export const sourceKind = pgEnum("source_kind", ["wallet", "exchange", "custodian"]);
export const walletRole = pgEnum("wallet_role", ["hot", "cold", "staking"]);
export const assetClass = pgEnum("asset_class", ["crypto", "stablecoin", "fiat"]);
export const accountType = pgEnum("account_type", ["asset", "liability", "equity", "income", "expense"]);
export const normalBalance = pgEnum("normal_balance", ["debit", "credit"]);
export const journalSide = pgEnum("journal_side", ["debit", "credit"]);
export const quantityDirection = pgEnum("quantity_direction", ["in", "out"]);
export const reconciliationStatus = pgEnum("reconciliation_status", ["matched", "exception"]);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  origin: dataOrigin("origin").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    functionalCurrency: text("functional_currency").notNull(),
    reportingFramework: text("reporting_framework").notNull(),
    parentEntityId: text("parent_entity_id"),
  },
  (table) => [
    index("entities_organization_id_idx").on(table.organizationId),
    foreignKey({
      columns: [table.parentEntityId],
      foreignColumns: [table.id],
      name: "entities_parent_entity_id_fk",
    }),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    chain: text("chain"),
    decimals: integer("decimals").notNull(),
    assetClass: assetClass("asset_class").notNull(),
  },
  (table) => [
    uniqueIndex("assets_organization_code_unique").on(table.organizationId, table.code),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    kind: sourceKind("kind").notNull(),
    role: walletRole("role"),
    name: text("name").notNull(),
    chain: text("chain"),
    identifier: text("identifier").notNull(),
  },
  (table) => [
    index("sources_entity_id_idx").on(table.entityId),
    uniqueIndex("sources_entity_identifier_unique").on(table.entityId, table.identifier),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    normalBalance: normalBalance("normal_balance").notNull(),
    /** Illustrative IFRS label such as IAS 38, IAS 2, IFRS 9, or IFRS 13. */
    measurementBasis: text("measurement_basis"),
    ifrsNote: text("ifrs_note"),
  },
  (table) => [uniqueIndex("accounts_entity_code_unique").on(table.entityId, table.code)],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    reference: text("reference").notNull(),
    entryDate: date("entry_date").notNull(),
    memo: text("memo").notNull(),
    currency: text("currency").notNull(),
    debitMinor: bigint("debit_minor", { mode: "bigint" }).notNull(),
    creditMinor: bigint("credit_minor", { mode: "bigint" }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("journal_entries_entity_reference_unique").on(table.entityId, table.reference),
    index("journal_entries_entity_date_idx").on(table.entityId, table.entryDate),
    check("journal_entries_balanced", sql`${table.debitMinor} = ${table.creditMinor}`),
    check("journal_entries_positive", sql`${table.debitMinor} > 0`),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entryId: text("entry_id")
      .notNull()
      .references(() => journalEntries.id),
    lineNumber: integer("line_number").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    side: journalSide("side").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    quantityMinor: bigint("quantity_minor", { mode: "bigint" }),
    quantityDirection: quantityDirection("quantity_direction"),
    assetId: text("asset_id").references(() => assets.id),
    sourceId: text("source_id").references(() => sources.id),
    memo: text("memo"),
  },
  (table) => [
    uniqueIndex("journal_lines_entry_line_unique").on(table.entryId, table.lineNumber),
    index("journal_lines_entry_id_idx").on(table.entryId),
    check("journal_lines_amount_positive", sql`${table.amountMinor} > 0`),
    check(
      "journal_lines_quantity_positive",
      sql`(${table.quantityMinor} is null or ${table.quantityMinor} > 0)`,
    ),
  ],
);

export const sourceTransactions = pgTable(
  "source_transactions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id").notNull(),
    occurredOn: date("occurred_on").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    direction: quantityDirection("direction").notNull(),
    quantityMinor: bigint("quantity_minor", { mode: "bigint" }).notNull(),
    description: text("description").notNull(),
  },
  (table) => [
    uniqueIndex("source_transactions_source_external_unique").on(table.sourceId, table.externalId),
    index("source_transactions_entity_date_idx").on(table.entityId, table.occurredOn),
    check("source_transactions_quantity_positive", sql`${table.quantityMinor} > 0`),
  ],
);

export const reconciliationRecords = pgTable(
  "reconciliation_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: reconciliationStatus("status").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    direction: quantityDirection("direction").notNull(),
    quantityMinor: bigint("quantity_minor", { mode: "bigint" }).notNull(),
    sourceTransactionId: text("source_transaction_id").references(() => sourceTransactions.id),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    journalLineNumber: integer("journal_line_number"),
    note: text("note").notNull(),
  },
  (table) => [
    index("reconciliation_records_entity_period_idx").on(table.entityId, table.periodStart, table.periodEnd),
    check("reconciliation_records_quantity_positive", sql`${table.quantityMinor} > 0`),
  ],
);
