/**
 * Token Ledger domain model, stored in Postgres.
 *
 * Organizations hold legal entities (Malaysia / Singapore first). Each entity
 * has read-only connections. A connection owns sources: a wallet address, an
 * exchange account, or a custodian vault. Balance snapshots are observed
 * holdings. Source transactions are movements. Neither is a journal.
 * Reconciliation records tie movements to journal lines. No connection stores
 * an API key or a signing key.
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
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * An observed or booked asset quantity, as an integer count of the smallest
 * unit at the asset's decimals (wei, lamports, sats). Quantities are unbounded,
 * so this is `numeric(78, 0)` — Postgres `bigint` tops out at ~9.2e18, which is
 * only ~9.2 ETH at 18 decimals. Kept as a JS `bigint`.
 */
const quantity = (name: string) => numeric(name, { precision: 78, scale: 0, mode: "bigint" });

export const dataOrigin = pgEnum("data_origin", ["example", "live"]);
export const sourceKind = pgEnum("source_kind", ["wallet", "exchange", "custodian"]);
export const walletRole = pgEnum("wallet_role", ["hot", "cold", "staking"]);
export const connectionMode = pgEnum("connection_mode", ["watch", "exchange_read", "custodian_read"]);
export const connectionStatus = pgEnum("connection_status", ["pending", "healthy", "degraded", "revoked"]);
export const assetClass = pgEnum("asset_class", ["crypto", "stablecoin", "fiat"]);
export const accountType = pgEnum("account_type", ["asset", "liability", "equity", "income", "expense"]);
export const normalBalance = pgEnum("normal_balance", ["debit", "credit"]);
export const journalSide = pgEnum("journal_side", ["debit", "credit"]);
export const quantityDirection = pgEnum("quantity_direction", ["in", "out"]);
export const reconciliationStatus = pgEnum("reconciliation_status", ["matched", "exception"]);
export const journalDraftStatus = pgEnum("journal_draft_status", ["draft", "pending", "posted"]);
/** "match" pairs a transaction with a line; "unmatch" rejects an automatic match. */
export const reconciliationOverrideKind = pgEnum("reconciliation_override_kind", ["match", "unmatch"]);
export const userRole = pgEnum("user_role", ["owner", "admin", "accountant", "approver", "viewer"]);
export const userStatus = pgEnum("user_status", ["active", "invited", "inactive"]);
export const syncRunStatus = pgEnum("sync_run_status", ["running", "ok", "partial", "failed", "not_live"]);
export const syncRunTrigger = pgEnum("sync_run_trigger", ["manual", "scheduled", "webhook", "cli"]);
export const matchJobStatus = pgEnum("match_job_status", ["queued", "done"]);

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

/**
 * Consent for a read-only feed. Scopes are balances and movements only.
 * A custodian secret is intentionally absent. An exchange credential, when one
 * is needed, is stored sealed in `connection_credentials`, never here.
 */
export const connections = pgTable(
  "connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    mode: connectionMode("mode").notNull(),
    venue: text("venue").notNull(),
    name: text("name").notNull(),
    status: connectionStatus("status").notNull(),
    scopes: text("scopes").notNull(),
    cursor: text("cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    /**
     * When a failed connection is next eligible for a scheduled pull. Set on a
     * failure (last start + backoff), cleared on success. Null means due now.
     * A manual refresh ignores it; the scheduler reads it.
     */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connections_organization_id_idx").on(table.organizationId),
    index("connections_entity_id_idx").on(table.entityId),
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
    connectionId: text("connection_id").references(() => connections.id),
    kind: sourceKind("kind").notNull(),
    role: walletRole("role"),
    name: text("name").notNull(),
    chain: text("chain"),
    identifier: text("identifier").notNull(),
  },
  (table) => [
    index("sources_entity_id_idx").on(table.entityId),
    index("sources_connection_id_idx").on(table.connectionId),
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
    /** Name recorded with the posting. There is no login yet. */
    postedBy: text("posted_by").notNull(),
    reversesEntryId: text("reverses_entry_id"),
  },
  (table) => [
    uniqueIndex("journal_entries_entity_reference_unique").on(table.entityId, table.reference),
    index("journal_entries_entity_date_idx").on(table.entityId, table.entryDate),
    foreignKey({
      columns: [table.reversesEntryId],
      foreignColumns: [table.id],
      name: "journal_entries_reverses_entry_id_fk",
    }),
    check("journal_entries_balanced", sql`${table.debitMinor} = ${table.creditMinor}`),
    check("journal_entries_positive", sql`${table.debitMinor} > 0`),
    check(
      "journal_entries_not_self_reversal",
      sql`${table.reversesEntryId} is null or ${table.reversesEntryId} <> ${table.id}`,
    ),
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
    quantityMinor: quantity("quantity_minor"),
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

/**
 * A journal before it is posted. `draft` is editable and invisible to reports;
 * `pending` awaits approval; `posted` is a link to the immutable journal entry it
 * became (or the reference of a reversal). Approval inserts into the immutable
 * `journal_entries`/`journal_lines` and marks the draft posted, so posted books
 * stay immutable and a draft is never a posted row.
 */
export const journalDrafts = pgTable(
  "journal_drafts",
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
    status: journalDraftStatus("status").notNull(),
    /** Who prepared it. An approver of the same identity is blocked without an override. */
    preparedBy: text("prepared_by").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** The posted entry this draft became, once approved. */
    postedEntryId: text("posted_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("journal_drafts_org_status_idx").on(table.organizationId, table.status),
    index("journal_drafts_entity_idx").on(table.entityId),
    check("journal_drafts_balanced", sql`${table.debitMinor} = ${table.creditMinor}`),
    check("journal_drafts_positive", sql`${table.debitMinor} > 0`),
  ],
);

/** A line of a draft journal. Free to change or delete while the draft is editable. */
export const journalDraftLines = pgTable(
  "journal_draft_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    draftId: text("draft_id")
      .notNull()
      .references(() => journalDrafts.id),
    lineNumber: integer("line_number").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    side: journalSide("side").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    quantityMinor: quantity("quantity_minor"),
    quantityDirection: quantityDirection("quantity_direction"),
    assetId: text("asset_id").references(() => assets.id),
    sourceId: text("source_id").references(() => sources.id),
    memo: text("memo"),
  },
  (table) => [
    uniqueIndex("journal_draft_lines_draft_line_unique").on(table.draftId, table.lineNumber),
    check("journal_draft_lines_amount_positive", sql`${table.amountMinor} > 0`),
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
    quantityMinor: quantity("quantity_minor").notNull(),
    description: text("description").notNull(),
  },
  (table) => [
    uniqueIndex("source_transactions_source_external_unique").on(table.sourceId, table.externalId),
    index("source_transactions_entity_date_idx").on(table.entityId, table.occurredOn),
    check("source_transactions_quantity_positive", sql`${table.quantityMinor} > 0`),
  ],
);

/** Point-in-time quantity observed on a source. This is not a journal balance. */
export const balanceSnapshots = pgTable(
  "balance_snapshots",
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
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    quantityMinor: quantity("quantity_minor").notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("balance_snapshots_source_asset_as_of_unique").on(table.sourceId, table.assetId, table.asOf),
    index("balance_snapshots_source_id_idx").on(table.sourceId),
    check("balance_snapshots_quantity_non_negative", sql`${table.quantityMinor} >= 0`),
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
    quantityMinor: quantity("quantity_minor").notNull(),
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

/**
 * A manual reconciliation decision that survives a reload. Automatic matching
 * runs on load and produces exceptions; an accountant pairs a source transaction
 * with a journal line here. The builder overlays these on top of the automatic
 * result, so the automatic pass stays pure and a human decision is explicit and
 * auditable. `kind` distinguishes an acceptance ("match") from a rejection
 * ("unmatch") of an automatic match.
 */
export const reconciliationOverrides = pgTable(
  "reconciliation_overrides",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    sourceTransactionId: text("source_transaction_id")
      .notNull()
      .references(() => sourceTransactions.id),
    journalEntryId: text("journal_entry_id"),
    journalLineNumber: integer("journal_line_number"),
    kind: reconciliationOverrideKind("kind").notNull(),
    note: text("note").notNull(),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reconciliation_overrides_source_unique").on(table.sourceTransactionId),
    index("reconciliation_overrides_org_idx").on(table.organizationId),
  ],
);

/**
 * One major unit of baseCurrency equals numerator / 10^scale major units of quoteCurrency.
 * Example rows are labelled origin = example and are not a market price.
 */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    numerator: bigint("numerator", { mode: "bigint" }).notNull(),
    scale: integer("scale").notNull(),
    asOf: date("as_of").notNull(),
    origin: dataOrigin("origin").notNull(),
    note: text("note").notNull(),
  },
  (table) => [
    index("fx_rates_pair_date_idx").on(table.organizationId, table.baseCurrency, table.quoteCurrency, table.asOf),
    check("fx_rates_numerator_positive", sql`${table.numerator} > 0`),
    check("fx_rates_scale_non_negative", sql`${table.scale} >= 0 and ${table.scale} <= 12`),
    check("fx_rates_distinct_currencies", sql`${table.baseCurrency} <> ${table.quoteCurrency}`),
  ],
);

/**
 * A dated market price per asset, in a quote currency. Provenance matters: the
 * `origin` says whether the row is example data or fetched live, and `asOf` is
 * the instant the price was observed. A price never posts to the journal on its
 * own; it is used to value holdings and to draft a reviewable revaluation.
 */
export const assetPrices = pgTable(
  "asset_prices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    assetCode: text("asset_code").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    /** Price of one whole asset unit, in minor units of the quote currency. */
    priceMinor: numeric("price_minor", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    /** Minor-unit scale of the quote currency (2 for fiat), so priceMinor is unambiguous. */
    quoteScale: integer("quote_scale").notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    origin: dataOrigin("origin").notNull(),
    /** Where the price came from, e.g. "coingecko" or "example". */
    source: text("source").notNull(),
  },
  (table) => [
    index("asset_prices_org_asset_asof_idx").on(table.organizationId, table.assetCode, table.asOf),
    check("asset_prices_price_positive", sql`${table.priceMinor} > 0`),
    check("asset_prices_quote_scale_range", sql`${table.quoteScale} >= 0 and ${table.quoteScale} <= 12`),
  ],
);

/** Append-only record of who posted what. Updates and ordinary deletes are rejected by a trigger. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    detail: text("detail").notNull(),
  },
  (table) => [index("audit_events_organization_occurred_idx").on(table.organizationId, table.occurredAt)],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: userRole("role").notNull(),
    status: userStatus("status").notNull(),
    /** Comma-separated entity ids. Empty means every entity in the organization. */
    entityScope: text("entity_scope").notNull().default(""),
    /** Set when an admin finishes or skips the connection tour. Null means a new admin still needs it. */
    connectionTourCompletedAt: timestamp("connection_tour_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_organization_email_unique").on(table.organizationId, table.email),
    index("users_organization_id_idx").on(table.organizationId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const signInAttempts = pgTable(
  "sign_in_attempts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    succeeded: boolean("succeeded").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sign_in_attempts_email_attempted_idx").on(table.email, table.attemptedAt)],
);

export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    role: userRole("role").notNull(),
    entityScope: text("entity_scope").notNull().default(""),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("invites_token_hash_unique").on(table.tokenHash)],
);

/**
 * A connector credential (an exchange read-only API key and secret), sealed at
 * rest. The plaintext never reaches the database: `sealedKey` and `sealedSecret`
 * hold AES-256-GCM blobs produced by the credentials module. A credential is
 * bound to one connection and is never returned to the browser.
 */
export const connectionCredentials = pgTable(
  "connection_credentials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id),
    /** Redacted hint for display only, e.g. the last 4 characters. Never a secret. */
    keyHint: text("key_hint").notNull(),
    sealedKey: text("sealed_key").notNull(),
    sealedSecret: text("sealed_secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("connection_credentials_connection_unique").on(table.connectionId),
    index("connection_credentials_organization_id_idx").on(table.organizationId),
  ],
);

/**
 * One attempt to pull a connection, whether manual, scheduled, or a re-run.
 * Every run leaves a row, so the history is auditable and the operations view
 * can show connector health. `status` records the outcome of the whole run.
 */
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: syncRunStatus("status").notNull(),
    /** How the run was started. */
    trigger: syncRunTrigger("trigger").notNull(),
    balancesRead: integer("balances_read").notNull().default(0),
    movementsRead: integer("movements_read").notNull().default(0),
    accountsRead: integer("accounts_read").notNull().default(0),
    error: text("error"),
  },
  (table) => [
    index("sync_runs_connection_started_idx").on(table.connectionId, table.startedAt),
    index("sync_runs_organization_started_idx").on(table.organizationId, table.startedAt),
  ],
);

/**
 * Raw payload retained from a run, for audit and replay. Payloads can be large,
 * so retention is a rolling window: only the most recent runs keep payloads
 * (see `RAW_PAYLOAD_RUN_RETENTION` in src/db/sync-runs.ts). The run row itself
 * is always kept; only the payload ages out.
 *
 * `payload` is the adapter output as JSON. `quantityMinor` values are stored as
 * decimal strings to survive JSON without precision loss.
 */
export const syncRunPayloads = pgTable(
  "sync_run_payloads",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => syncRuns.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id),
    /** "balances" or "movements". */
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sync_run_payloads_run_id_idx").on(table.runId)],
);

/**
 * A signed event pushed by a source, kept as the audit trail for event
 * ingestion. `externalId` is unique per source, so a redelivery is a no-op.
 * The raw body is retained for dispute and replay; it is small and bounded by
 * the receiver's size limit.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    /** Delivery id from the signature header, when the sender supplies one. */
    deliveryId: text("delivery_id"),
    externalId: text("external_id").notNull(),
    /** Fingerprint of the normalized event, to reject an exact duplicate. */
    fingerprint: text("fingerprint").notNull(),
    rawBody: text("raw_body").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("webhook_events_source_external_unique").on(table.sourceId, table.externalId),
    index("webhook_events_organization_received_idx").on(table.organizationId, table.receivedAt),
  ],
);

/**
 * A queued reconciliation pass after an event lands. Event ingestion writes
 * source transactions; matching them to the ledger is a follow-up job, so the
 * webhook response is fast and the same queue can back a later worker.
 */
export const matchJobs = pgTable(
  "match_jobs",
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
    status: matchJobStatus("status").notNull(),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [index("match_jobs_status_enqueued_idx").on(table.status, table.enqueuedAt)],
);
