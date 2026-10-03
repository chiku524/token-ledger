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
export const connectionOwnership = pgEnum("connection_ownership", ["verified", "watch_only"]);
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
 * A verified wallet stores the signature that proved control. It does not store a key.
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
    ownership: connectionOwnership("ownership").notNull().default("watch_only"),
    verifiedAddress: text("verified_address"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationSignature: text("verification_signature"),
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

/**
 * One-use proof that a signed-in user controls an address.
 * Consumed when the connection is created. A replay cannot consume it again.
 */
export const ownershipChallenges = pgTable(
  "ownership_challenges",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    sessionId: text("session_id").notNull(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    chain: text("chain").notNull(),
    address: text("address").notNull(),
    domain: text("domain").notNull(),
    nonce: text("nonce").notNull(),
    message: text("message").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ownership_challenges_nonce_unique").on(table.nonce),
    index("ownership_challenges_organization_id_idx").on(table.organizationId),
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
 * A closed date range per entity. Posting, reversing, and reconciliation changes
 * dated inside a closed period are refused until an owner or admin reopens it.
 */
export const periodLocks = pgTable(
  "period_locks",
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
    note: text("note").notNull(),
    actor: text("actor").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("period_locks_entity_idx").on(table.entityId, table.periodStart, table.periodEnd),
    check("period_locks_range", sql`${table.periodStart} <= ${table.periodEnd}`),
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
    /**
     * When the email was confirmed. Null means unverified: the account works, but
     * the pages can prompt to confirm. A sign-up and an accepted invite count as
     * unverified until a link is followed.
     */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
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
 * A single-use password-reset token. Only a hash is stored; the token itself is
 * emailed and never logged. A reset invalidates the user's sessions.
 */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("password_resets_token_hash_unique").on(table.tokenHash),
    index("password_resets_user_id_idx").on(table.userId),
  ],
);

/** A single-use email-verification token. Only a hash is stored. */
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_verifications_token_hash_unique").on(table.tokenHash),
    index("email_verifications_user_id_idx").on(table.userId),
  ],
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

// ---------------------------------------------------------------------------
// Solana contracts: Service Balance (billing) and Accounts Payable (treasury)
//
// These tables are projections of the on-chain programs and the private data
// that drives them. They are additive: an organization that funds no contract
// is unaffected. Nothing here is a source of truth for money — the chain is.
// `finalized` marks a row the indexer confirmed in a finalized slot; an app
// path must never treat a submitted transaction as settled. See
// docs/adr-solana-contracts.md.
// ---------------------------------------------------------------------------

/** Whether an on-chain projection has been confirmed in a finalized slot. */
export const contractFinalization = pgEnum("contract_finalization", ["pending", "finalized", "failed"]);
/** A logical signing/submission attempt's lifecycle. */
export const chainTxStatus = pgEnum("chain_tx_status", ["prepared", "submitted", "confirmed", "finalized", "failed", "expired"]);
/** A durable outbox job's lifecycle. */
export const jobStatus = pgEnum("job_status", ["queued", "leased", "done", "failed"]);
/** An invoice's lifecycle. Draft is off-chain; the rest mirror the chain. */
export const invoiceStatus = pgEnum("invoice_status", ["draft", "proposed", "paid", "cancelled"]);
/** A supplier destination's verification state. */
export const destinationVerification = pgEnum("destination_verification", ["unverified", "verified", "revoked"]);

/**
 * The deployment a row belongs to. The app resolves cluster, program IDs and
 * mint from here, never from user input. One row per cluster.
 */
export const chainDeployments = pgTable(
  "chain_deployments",
  {
    id: text("id").primaryKey(),
    cluster: text("cluster").notNull(),
    serviceBalanceProgram: text("service_balance_program").notNull(),
    treasuryPayablesProgram: text("treasury_payables_program").notNull(),
    usdcMint: text("usdc_mint").notNull(),
    tokenProgram: text("token_program").notNull(),
    /** IDL/build version this deployment was generated from. */
    idlVersion: text("idl_version").notNull(),
    /** Commit the deployed bytecode was built from, when known. */
    buildCommit: text("build_commit"),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("chain_deployments_cluster_unique").on(table.cluster)],
);

/**
 * A one-use, expiring proof that a signed-in user controls an address on a
 * cluster, for a specific entity. Separate from `ownership_challenges`, which
 * proves control for a read-only connection: a binding names the cluster and the
 * contract intent. Consumed when the binding is written; a replay cannot consume
 * it again.
 */
export const bindingChallenges = pgTable(
  "binding_challenges",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: text("session_id").notNull(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    cluster: text("cluster").notNull(),
    address: text("address").notNull(),
    domain: text("domain").notNull(),
    nonce: text("nonce").notNull(),
    message: text("message").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("binding_challenges_nonce_unique").on(table.nonce),
    index("binding_challenges_organization_id_idx").on(table.organizationId),
  ],
);

/**
 * A verified wallet bound to a user and entity: proof that the user controls
 * an address for financial actions. A binding is a verification, not a signing
 * key — the app never stores a key. Revoked bindings stay for audit.
 */
export const walletBindings = pgTable(
  "wallet_bindings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** The one-use challenge that was consumed to prove control. */
    challengeId: text("challenge_id").references(() => bindingChallenges.id, { onDelete: "set null" }),
    cluster: text("cluster").notNull(),
    walletAddress: text("wallet_address").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("wallet_bindings_entity_wallet_cluster_unique").on(table.entityId, table.walletAddress, table.cluster),
    index("wallet_bindings_organization_id_idx").on(table.organizationId),
    index("wallet_bindings_user_id_idx").on(table.userId),
  ],
);

/** A customer's billing vault, projected from `service_balance`. */
export const billingVaults = pgTable(
  "billing_vaults",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    chainDeploymentId: text("chain_deployment_id")
      .notNull()
      .references(() => chainDeployments.id),
    merchantAddress: text("merchant_address").notNull(),
    vaultAddress: text("vault_address").notNull(),
    vaultAuthority: text("vault_authority").notNull(),
    vaultTokenAccount: text("vault_token_account").notNull(),
    controllerAddress: text("controller_address").notNull(),
    mint: text("mint").notNull(),
    finalization: contractFinalization("finalization").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_vaults_cluster_vault_unique").on(table.chainDeploymentId, table.vaultAddress),
    index("billing_vaults_entity_idx").on(table.entityId),
  ],
);

/**
 * The signed mandate for a billing vault. Version one has one mandate PDA per
 * vault; a replacement rewrites it in place and increments `generation`.
 */
export const mandates = pgTable(
  "mandates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    billingVaultId: text("billing_vault_id")
      .notNull()
      .references(() => billingVaults.id),
    mandateAddress: text("mandate_address").notNull(),
    planAddress: text("plan_address").notNull(),
    planId: text("plan_id").notNull(),
    planVersion: integer("plan_version").notNull(),
    /** Fixed price per period, in USDC minor units. */
    priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(),
    periodSeconds: integer("period_seconds").notNull(),
    maxTotalDebitMinor: bigint("max_total_debit_minor", { mode: "bigint" }).notNull(),
    totalDebitedMinor: bigint("total_debited_minor", { mode: "bigint" }).notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    authorizationExpiry: timestamp("authorization_expiry", { withTimezone: true }).notNull(),
    paidThrough: timestamp("paid_through", { withTimezone: true }).notNull(),
    nextCycle: bigint("next_cycle", { mode: "bigint" }).notNull(),
    generation: bigint("generation", { mode: "bigint" }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    finalization: contractFinalization("finalization").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mandates_vault_unique").on(table.billingVaultId),
    uniqueIndex("mandates_address_unique").on(table.mandateAddress),
    index("mandates_entity_idx").on(table.entityId),
  ],
);

/** One collected cycle, unique per mandate and cycle. Durable even if an event is missed. */
export const billingCharges = pgTable(
  "billing_charges",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id),
    cycle: bigint("cycle", { mode: "bigint" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    receiptAddress: text("receipt_address").notNull(),
    coverageStart: timestamp("coverage_start", { withTimezone: true }).notNull(),
    coverageEnd: timestamp("coverage_end", { withTimezone: true }).notNull(),
    /** The chain transaction that collected it. */
    chainTransactionId: text("chain_transaction_id"),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_charges_mandate_cycle_unique").on(table.mandateId, table.cycle),
    index("billing_charges_entity_idx").on(table.entityId),
    check("billing_charges_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

/** A company treasury, projected from `treasury_payables`. */
export const treasuryAccounts = pgTable(
  "treasury_accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    chainDeploymentId: text("chain_deployment_id")
      .notNull()
      .references(() => chainDeployments.id),
    treasuryAddress: text("treasury_address").notNull(),
    treasuryAuthority: text("treasury_authority").notNull(),
    treasuryTokenAccount: text("treasury_token_account").notNull(),
    mint: text("mint").notNull(),
    policyVersion: bigint("policy_version", { mode: "bigint" }).notNull(),
    threshold: integer("threshold").notNull(),
    approverCount: integer("approver_count").notNull(),
    proposerCount: integer("proposer_count").notNull(),
    perPaymentLimitMinor: bigint("per_payment_limit_minor", { mode: "bigint" }).notNull(),
    dailyLimitMinor: bigint("daily_limit_minor", { mode: "bigint" }).notNull(),
    maxProposalLifetimeSeconds: integer("max_proposal_lifetime_seconds").notNull(),
    executionPaused: boolean("execution_paused").notNull().default(false),
    recoveryAddress: text("recovery_address").notNull(),
    closed: boolean("closed").notNull().default(false),
    finalization: contractFinalization("finalization").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("treasury_accounts_cluster_address_unique").on(table.chainDeploymentId, table.treasuryAddress),
    index("treasury_accounts_entity_idx").on(table.entityId),
  ],
);

/** The signer-policy projection: an approver or proposer on a treasury. */
export const treasurySigners = pgTable(
  "treasury_signers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccounts.id),
    /** "approver" or "proposer". */
    role: text("role").notNull(),
    signerAddress: text("signer_address").notNull(),
    policyVersion: bigint("policy_version", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("treasury_signers_treasury_role_addr_unique").on(table.treasuryAccountId, table.role, table.signerAddress),
    index("treasury_signers_organization_id_idx").on(table.organizationId),
  ],
);

/** A private supplier. Names and details stay off-chain. */
export const suppliers = pgTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    name: text("name").notNull(),
    /** Normalized name for duplicate detection. */
    normalizedName: text("normalized_name").notNull(),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("suppliers_entity_normalized_name_unique").on(table.entityId, table.normalizedName),
    index("suppliers_organization_id_idx").on(table.organizationId),
  ],
);

/** A verified payout address for a supplier, with its verification history. */
export const supplierDestinations = pgTable(
  "supplier_destinations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    address: text("address").notNull(),
    chain: text("chain").notNull(),
    verification: destinationVerification("verification").notNull().default("unverified"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("supplier_destinations_supplier_addr_chain_unique").on(table.supplierId, table.address, table.chain),
    index("supplier_destinations_organization_id_idx").on(table.organizationId),
  ],
);

/**
 * An off-chain invoice. The chain only guarantees one settlement per
 * `invoiceKey`; the backend enforces normalized supplier + reference
 * uniqueness within an entity (the unique index below).
 */
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    /** The opaque on-chain invoice key (hex), fixed when the first proposal is made. */
    invoiceKey: text("invoice_key").notNull(),
    supplierReference: text("supplier_reference").notNull(),
    normalizedReference: text("normalized_reference").notNull(),
    currency: text("currency").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    dueDate: date("due_date"),
    /** Salted hash of the private document; the document itself stays off-chain. */
    documentHash: text("document_hash"),
    documentNonce: text("document_nonce"),
    status: invoiceStatus("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_entity_key_unique").on(table.entityId, table.invoiceKey),
    uniqueIndex("invoices_entity_supplier_ref_unique").on(table.entityId, table.supplierId, table.normalizedReference),
    index("invoices_organization_id_idx").on(table.organizationId),
    check("invoices_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

/** A payment proposal revision, projected from `treasury_payables`. */
export const paymentProposals = pgTable(
  "payment_proposals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccounts.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    proposalAddress: text("proposal_address").notNull(),
    invoiceKey: text("invoice_key").notNull(),
    revision: integer("revision").notNull(),
    policyVersion: bigint("policy_version", { mode: "bigint" }).notNull(),
    recipientOwner: text("recipient_owner").notNull(),
    mint: text("mint").notNull(),
    grossAmountMinor: bigint("gross_amount_minor", { mode: "bigint" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
    executed: boolean("executed").notNull().default(false),
    finalization: contractFinalization("finalization").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_proposals_address_unique").on(table.proposalAddress),
    uniqueIndex("payment_proposals_invoice_revision_unique").on(table.invoiceId, table.revision),
    index("payment_proposals_treasury_idx").on(table.treasuryAccountId),
    check("payment_proposals_amount_positive", sql`${table.grossAmountMinor} > 0`),
  ],
);

/** One approver's decision on a payment proposal. Revoking clears the signature. */
export const paymentApprovals = pgTable(
  "payment_approvals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    paymentProposalId: text("payment_proposal_id")
      .notNull()
      .references(() => paymentProposals.id),
    approverAddress: text("approver_address").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_approvals_proposal_approver_unique").on(table.paymentProposalId, table.approverAddress),
    index("payment_approvals_organization_id_idx").on(table.organizationId),
  ],
);

/** A durable signing/submission attempt. One row per try, keyed by logical operation. */
export const chainTransactions = pgTable(
  "chain_transactions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    chainDeploymentId: text("chain_deployment_id")
      .notNull()
      .references(() => chainDeployments.id),
    /** Stable logical operation id; retries share it. */
    logicalOperationId: text("logical_operation_id").notNull(),
    /** What the operation is, e.g. "billing.collect" or "treasury.execute". */
    kind: text("kind").notNull(),
    attempt: integer("attempt").notNull(),
    signature: text("signature"),
    recentBlockhash: text("recent_blockhash"),
    status: chainTxStatus("status").notNull(),
    slot: bigint("slot", { mode: "bigint" }),
    error: text("error"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chain_transactions_logical_attempt_unique").on(table.logicalOperationId, table.attempt),
    uniqueIndex("chain_transactions_signature_unique").on(table.signature),
    index("chain_transactions_organization_id_idx").on(table.organizationId),
  ],
);

/**
 * A decoded program event or instruction, uniquely identified by cluster,
 * signature and instruction/event ordinal. `organization_id` is nullable: the
 * indexer may observe an event before it maps to a tenant.
 */
export const chainEvents = pgTable(
  "chain_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id),
    cluster: text("cluster").notNull(),
    signature: text("signature").notNull(),
    instructionIndex: integer("instruction_index").notNull(),
    eventOrdinal: integer("event_ordinal").notNull(),
    programId: text("program_id").notNull(),
    name: text("name").notNull(),
    payload: jsonb("payload").notNull(),
    slot: bigint("slot", { mode: "bigint" }),
    blockTime: timestamp("block_time", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chain_events_cluster_sig_ix_ordinal_unique").on(
      table.cluster,
      table.signature,
      table.instructionIndex,
      table.eventOrdinal,
    ),
    index("chain_events_organization_observed_idx").on(table.organizationId, table.observedAt),
  ],
);

/**
 * A finalized settlement: one row per (cluster, treasury, invoice key). This is
 * the chain evidence a journal proposal is built from, never a client claim.
 */
export const paymentSettlements = pgTable(
  "payment_settlements",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccounts.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    paymentProposalId: text("payment_proposal_id")
      .notNull()
      .references(() => paymentProposals.id),
    cluster: text("cluster").notNull(),
    invoiceKey: text("invoice_key").notNull(),
    recipientOwner: text("recipient_owner").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    signature: text("signature").notNull(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_settlements_cluster_treasury_invoice_unique").on(table.cluster, table.treasuryAccountId, table.invoiceKey),
    uniqueIndex("payment_settlements_signature_unique").on(table.signature),
    index("payment_settlements_entity_idx").on(table.entityId),
    check("payment_settlements_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

/**
 * The link from a settlement to an accounting result. A settlement may yield
 * several postings for different purposes, so uniqueness is by purpose, not by
 * settlement. Export follows internal posting and is retried independently.
 */
export const settlementJournalLinks = pgTable(
  "settlement_journal_links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => paymentSettlements.id),
    /** The reviewable draft that was or will be posted. */
    journalDraftId: text("journal_draft_id").references(() => journalDrafts.id),
    /** Set once the draft is posted to the immutable journal. */
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    /** Why this posting exists, e.g. "supplier_expense" or "payable_clearing". */
    purpose: text("purpose").notNull(),
    status: journalDraftStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("settlement_journal_links_settlement_purpose_unique").on(table.settlementId, table.purpose),
    index("settlement_journal_links_organization_id_idx").on(table.organizationId),
  ],
);

/** A durable outbox row: a retryable side effect with a stable dedupe key. */
export const jobOutbox = pgTable(
  "job_outbox",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id),
    /** What to do, e.g. "billing.collect" or "treasury.execute". */
    kind: text("kind").notNull(),
    /** The logical operation the job acts on. */
    subjectId: text("subject_id"),
    payload: jsonb("payload").notNull(),
    /** A stable key so enqueuing the same work twice is a no-op. */
    dedupeKey: text("dedupe_key").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leasedAt: timestamp("leased_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("job_outbox_dedupe_key_unique").on(table.dedupeKey),
    index("job_outbox_status_available_idx").on(table.status, table.availableAt),
  ],
);

/** A durable backfill checkpoint per cluster and program. */
export const chainCursors = pgTable(
  "chain_cursors",
  {
    id: text("id").primaryKey(),
    cluster: text("cluster").notNull(),
    programId: text("program_id").notNull(),
    /** The last observed slot or signature, as an opaque cursor. */
    cursor: text("cursor").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("chain_cursors_cluster_program_unique").on(table.cluster, table.programId)],
);
