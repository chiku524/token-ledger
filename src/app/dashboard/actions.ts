"use server";

import { createVenueConnector, venueDefinition } from "@/adapters";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import { custodianDefinition } from "@/adapters/sources/custodian/registry";
import { actorName, assertCsrf, AuthError, requirePermission, type SessionUser } from "@/auth/current";
import { canAccessEntity, type Permission } from "@/auth/roles";
import { canWriteBooks } from "@/data/authorized-books";
import { connectionReturnPath } from "@/data/connection-return";
import { connectionFromForm, sourcesForConnection } from "@/data/connections";
import { postFormJournal } from "@/data/journal-form";
import { loadBooks } from "@/data/load-books";
import { refreshAssetPrices, refreshFxRates } from "@/data/market-data";
import { revaluationForEntity } from "@/data/valuation";
import { runConnectionSync, type SyncRunOutcome } from "@/data/run-sync";
import { parseSourceTransactionCsv } from "@/data/source-csv";
import {
  connectionFormSchema,
  entityFormSchema,
  firstIssue,
  fxRateFormSchema,
  journalFormSchema,
  reversalFormSchema,
} from "@/data/validate";
import {
  BooksWriteError,
  insertConnection,
  insertEntity,
  insertFxRate,
  insertJournal,
  insertReversal,
  insertSourceTransactions,
  revokeConnection,
} from "@/db/write";
import { postJournalEntry, toMinor } from "@/ledger";
import { fail, finish, save } from "./form-state";

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";

export async function createEntityAction(formData: FormData) {
  const path = "/dashboard/entities";
  const session = await guard(path, "entity.write", formData);
  requireWritable(path, session);
  const parsed = entityFormSchema.safeParse({
    name: formData.get("name"),
    jurisdiction: String(formData.get("jurisdiction") ?? "").toUpperCase(),
    functionalCurrency: formData.get("functionalCurrency"),
    reportingFramework: formData.get("reportingFramework"),
    parentEntityId: formData.get("parentEntityId"),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  const books = await loadBooks(session.organizationId);
  await save(path, async () => {
    if (parsed.data.parentEntityId) assertEntity(session, parsed.data.parentEntityId);
    await insertEntity(books, parsed.data, actorName(session));
  });
  finish(path, "Company added, with a standard set of accounts.");
}

export async function createConnectionAction(formData: FormData) {
  const path = connectionReturnPath(formData.get("next"));
  const session = await guard(path, "source.write", formData);
  requireWritable(path, session);
  const parsed = connectionFormSchema.safeParse({
    entityId: formData.get("entityId"),
    mode: formData.get("mode"),
    name: formData.get("name"),
    chain: formData.get("chain") ?? "",
    role: formData.get("role") ?? "",
    identifier: formData.get("identifier"),
    exchangeVenue: formData.get("exchangeVenue") ?? "",
    custodianVenue: formData.get("custodianVenue") ?? "",
    apiKey: formData.get("apiKey") ?? "",
    apiSecret: formData.get("apiSecret") ?? "",
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  const books = await loadBooks(session.organizationId);
  const draft = connectionFromForm(parsed.data);

  // An exchange or custodian credential is validated by a real read-only call
  // before it is sealed and stored, so a bad key is rejected up front.
  const venue = venueDefinition(draft.connection.venue);
  const custodian = custodianDefinition(draft.connection.venue);
  let credential: ExchangeCredentialInput | undefined;
  if (venue || custodian) {
    const label = venue?.label ?? custodian!.label;
    if (!parsed.data.apiKey || !parsed.data.apiSecret) {
      fail(path, `A ${label} connection needs a read-only credential.`);
    }
    credential = { apiKey: parsed.data.apiKey!, apiSecret: parsed.data.apiSecret! };
    await save(path, async () => {
      if (venue) await validateExchangeCredential(venue.key, credential!);
      else await custodian!.verify(credential!);
    });
  }

  await save(path, async () => {
    assertEntity(session, parsed.data.entityId);
    await insertConnection(books, draft, actorName(session), credential);
  });
  finish(
    path,
    credential
      ? "Read-only connection added. The credential is stored sealed and cannot trade, withdraw, or sign."
      : "Read-only connection added. It is waiting for a check, and no key was stored.",
  );
}

/** A successful balance read proves the read-only key works. The credential is discarded. */
async function validateExchangeCredential(venueKey: string, credential: ExchangeCredentialInput): Promise<void> {
  try {
    await createVenueConnector(venueKey, credential).verify();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The exchange rejected the credential.";
    throw new BooksWriteError(`Credential check failed: ${message}`);
  }
}

/**
 * Post a period-end revaluation as one balanced entry, computed from the latest
 * saved prices. The accountant triggers this deliberately; it is never
 * automatic. The entry records a reference and memo so the price basis is
 * visible, and is corrected by a reversal like any other entry.
 */
export async function postRevaluationAction(formData: FormData) {
  const path = "/dashboard/reports";
  const session = await guard(path, "journal.post", formData);
  requireWritable(path, session);
  const entityId = String(formData.get("entityId") ?? "");
  const asOf = String(formData.get("asOf") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) fail(path, "Give the revaluation a reference.");
  const books = await loadBooks(session.organizationId);
  const entity = books.entities.find((item) => item.id === entityId);
  if (!entity) fail(path, "Choose a company in this organization.");
  assertEntityOrFail(path, session, entityId);

  const proposal = revaluationForEntity({
    entries: books.journalEntries,
    accounts: books.accounts,
    assets: books.assets,
    prices: books.assetPrices,
    entityId,
    quoteCurrency: entity.functionalCurrency,
    assetAccountCode: "1310",
    gainAccountCode: "4200",
    lossAccountCode: "5200",
    asOf,
  });
  if (proposal.journalLines.length === 0) fail(path, "Nothing to revalue: market value matches carrying value.");
  const entry = postJournalEntry({
    entityId,
    reference,
    entryDate: asOf.slice(0, 10),
    memo: `Revaluation as of ${asOf.slice(0, 10)}`,
    lines: proposal.journalLines,
  });
  await save(path, () => insertJournal(books, entry, actorName(session)));
  finish(path, `Revaluation posted. Net ${proposal.netMinor > 0n ? "gain" : "loss"} recorded; reverse it if the price was wrong.`);
}

/** Fetch and store live asset prices and FX rates for this organization. */
export async function refreshMarketDataAction(formData: FormData) {
  const path = connectionReturnPath(formData.get("next"));
  const session = await guard(path, "source.write", formData);
  requireWritable(path, session);
  let message = "";
  await save(path, async () => {
    const prices = await refreshAssetPrices(session.organizationId);
    const fx = await refreshFxRates(session.organizationId);
    message = `${prices.message} ${fx.message}`.trim();
    if (prices.skipped && fx.skipped) throw new BooksWriteError(prices.message);
  });
  finish(path, message || "Market data refreshed.");
}

export async function refreshConnectionAction(formData: FormData) {
  const path = connectionReturnPath(formData.get("next"));
  const session = await guard(path, "source.write", formData);
  requireWritable(path, session);
  const connectionId = String(formData.get("connectionId") ?? "");
  const books = await loadBooks(session.organizationId);
  const connection = books.connections.find((item) => item.id === connectionId);
  if (!connection) fail(path, "That connection is not in this organization.");
  assertEntityOrFail(path, session, connection.entityId);
  if (connection.status === "revoked") fail(path, "This connection is disconnected.");
  const linked = sourcesForConnection(books.sources, connection);
  if (linked.length === 0) fail(path, "This connection has no account to read.");
  let outcome: SyncRunOutcome | undefined;
  await save(path, async () => {
    outcome = await runConnectionSync(books, connection.id, { actor: actorName(session), trigger: "manual" });
  });
  // A failed or not-live pull is an error, not a success. The message is
  // caller-safe; a raw driver error is never shown here.
  if (!outcome || outcome.status === "failed" || outcome.status === "not_live") {
    fail(path, outcome?.message ?? "The connection could not be read.");
  }
  finish(path, outcome.message);
}

export async function revokeConnectionAction(formData: FormData) {
  const path = connectionReturnPath(formData.get("next"));
  const session = await guard(path, "source.write", formData);
  requireWritable(path, session);
  const connectionId = String(formData.get("connectionId") ?? "");
  const books = await loadBooks(session.organizationId);
  const connection = books.connections.find((item) => item.id === connectionId);
  if (!connection) fail(path, "That connection is not in this organization.");
  assertEntityOrFail(path, session, connection.entityId);
  await save(path, () => revokeConnection(books, connection.id, actorName(session)));
  finish(path, "Connection disconnected. Past observations stay. Nothing further will be read.");
}

export async function importCsvAction(formData: FormData) {
  const path = "/dashboard/sources";
  const session = await guard(path, "source.import", formData);
  requireWritable(path, session);
  const sourceId = String(formData.get("sourceId") ?? "");
  const text = await csvText(formData);
  const books = await loadBooks(session.organizationId);
  const source = books.sources.find((item) => item.id === sourceId);
  if (!source) fail(path, "Choose a wallet, exchange, or custodian in this organization.");
  assertEntityOrFail(path, session, source.entityId);
  const parsed = parseSourceTransactionCsv(text, books.assets);
  if (!parsed.ok) fail(path, parsed.errors[0] ?? "CSV could not be read.");
  await save(path, () => insertSourceTransactions(books, sourceId, parsed.rows, actorName(session)));
  finish(path, "Activity imported. Matching on the next load uses these rows.");
}

export async function postJournalAction(formData: FormData) {
  const path = "/dashboard/ledger";
  const session = await guard(path, "journal.post", formData);
  requireWritable(path, session);
  const parsed = journalFormSchema.safeParse({
    entityId: formData.get("entityId"),
    reference: formData.get("reference"),
    entryDate: formData.get("entryDate"),
    memo: formData.get("memo"),
    lines: linesFromForm(formData),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  const books = await loadBooks(session.organizationId);
  await save(path, async () => {
    assertEntity(session, parsed.data.entityId);
    const entry = postFormJournal(parsed.data, books);
    await insertJournal(books, entry, actorName(session));
  });
  finish(path, "Entry posted. Posted entries are not edited. Post a correction if one is wrong.");
}

export async function reverseJournalAction(formData: FormData) {
  const path = "/dashboard/ledger";
  const session = await guard(path, "journal.reverse", formData);
  requireWritable(path, session);
  const parsed = reversalFormSchema.safeParse({
    entryId: formData.get("entryId"),
    reference: formData.get("reference"),
    entryDate: formData.get("entryDate"),
    memo: formData.get("memo"),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  const books = await loadBooks(session.organizationId);
  const original = books.journalEntries.find((entry) => entry.id === parsed.data.entryId);
  if (!original) fail(path, "That entry is not in these books.");
  assertEntityOrFail(path, session, original.entityId);
  await save(path, () =>
    insertReversal(
      books,
      parsed.data.entryId,
      { reference: parsed.data.reference, entryDate: parsed.data.entryDate, memo: parsed.data.memo },
      actorName(session),
    ),
  );
  finish(path, "Correction posted. The original entry is unchanged.");
}

export async function createFxRateAction(formData: FormData) {
  const path = "/dashboard/consolidation";
  const session = await guard(path, "fx.write", formData);
  requireWritable(path, session);
  const parsed = fxRateFormSchema.safeParse({
    baseCurrency: String(formData.get("baseCurrency") ?? "").toUpperCase(),
    quoteCurrency: String(formData.get("quoteCurrency") ?? "").toUpperCase(),
    rate: formData.get("rate"),
    asOf: formData.get("asOf"),
    note: formData.get("note"),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  const books = await loadBooks(session.organizationId);
  await save(path, () =>
    insertFxRate(
      books,
      {
        baseCurrency: parsed.data.baseCurrency,
        quoteCurrency: parsed.data.quoteCurrency,
        numerator: toMinor(parsed.data.rate, 4),
        scale: 4,
        asOf: parsed.data.asOf,
        note: parsed.data.note,
      },
      actorName(session),
    ),
  );
  finish(path, "Rate saved. The other direction is calculated from this rate and is not stored separately.");
}

async function guard(path: string, permission: Permission, formData: FormData): Promise<SessionUser> {
  try {
    await assertCsrf(formData);
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthError) fail(path, error.message);
    throw error;
  }
}

function requireWritable(path: string, session: SessionUser): void {
  if (!canWriteBooks(session)) fail(path, READ_ONLY);
}

function assertEntity(session: SessionUser, entityId: string): void {
  if (!canAccessEntity(session, entityId)) throw new AuthError("That company is outside your access.");
}

function assertEntityOrFail(path: string, session: SessionUser, entityId: string): void {
  if (!canAccessEntity(session, entityId)) fail(path, "That company is outside your access.");
}

function linesFromForm(formData: FormData) {
  const lines = [];
  for (let index = 0; index < 4; index += 1) {
    const accountCode = String(formData.get(`line${index}_account`) ?? "").trim();
    const amount = String(formData.get(`line${index}_amount`) ?? "").trim();
    if (!accountCode && !amount) continue;
    lines.push({
      accountCode,
      side: String(formData.get(`line${index}_side`) ?? ""),
      amount,
      assetCode: String(formData.get(`line${index}_asset`) ?? ""),
      quantity: String(formData.get(`line${index}_quantity`) ?? ""),
      quantityDirection: String(formData.get(`line${index}_direction`) ?? ""),
      sourceId: String(formData.get(`line${index}_source`) ?? ""),
    });
  }
  return lines;
}

async function csvText(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) return file.text();
  return String(formData.get("csv") ?? "");
}
