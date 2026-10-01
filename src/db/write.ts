import { and, eq } from "drizzle-orm";
import type { NormalizedBalance, NormalizedSourceTransaction } from "@/adapters";
import { sealExchangeCredential, type ExchangeCredentialInput } from "@/adapters/credentials/store";
import { READ_ONLY_SCOPES, type ConnectionDraft } from "@/data/connections";
import { ENTITY_CHART } from "@/data/chart-template";
import type { Books, ConnectionStatus } from "@/data/books";
import type { ParsedSourceTransaction } from "@/data/source-csv";
import { LedgerError, reverseJournalEntry, type PostedJournalEntry } from "@/ledger";
import { getDb } from "./client";
import {
  accounts,
  auditEvents,
  balanceSnapshots,
  connectionCredentials,
  connections,
  entities,
  fxRates,
  journalEntries,
  journalLines,
  sourceTransactions,
  sources,
} from "./schema";

export class BooksWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BooksWriteError";
  }
}

export async function insertEntity(
  books: Books,
  input: {
    name: string;
    jurisdiction: string;
    functionalCurrency: string;
    reportingFramework: string;
    parentEntityId: string | null;
  },
  actor: string,
): Promise<void> {
  if (input.parentEntityId && !books.entities.some((entity) => entity.id === input.parentEntityId)) {
    throw new BooksWriteError("That parent company is not in this organization.");
  }
  const id = newId("ent");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(entities).values({ id, organizationId: books.organization.id, ...input });
    await tx.insert(accounts).values(
      ENTITY_CHART.map((account) => ({
        ...account,
        id: newId("acct"),
        organizationId: books.organization.id,
        entityId: id,
      })),
    );
    await tx.insert(auditEvents).values(auditRow(books, actor, "entity.created", "entity", id, input.name));
  });
}

export async function insertConnection(
  books: Books,
  draft: ConnectionDraft,
  actor: string,
  credential?: ExchangeCredentialInput,
): Promise<void> {
  if (!books.entities.some((entity) => entity.id === draft.connection.entityId)) {
    throw new BooksWriteError("Choose a company in this organization.");
  }
  if (draft.connection.scopes !== READ_ONLY_SCOPES) {
    throw new BooksWriteError("A connection can only read balances and movements.");
  }
  const connectionId = newId("conn");
  const sourceId = newId("src");
  // Seal before opening the transaction; a bad credential must not half-write.
  const sealed = credential ? await sealExchangeCredential(credential) : null;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(connections).values({
      id: connectionId,
      organizationId: books.organization.id,
      entityId: draft.connection.entityId,
      mode: draft.connection.mode,
      venue: draft.connection.venue,
      name: draft.connection.name,
      status: "pending",
      scopes: READ_ONLY_SCOPES,
      cursor: null,
      lastSyncedAt: null,
      lastError: null,
      nextAttemptAt: null,
    });
    await tx.insert(sources).values({
      id: sourceId,
      organizationId: books.organization.id,
      connectionId,
      ...draft.source,
    });
    if (sealed) {
      await tx.insert(connectionCredentials).values({
        id: newId("cred"),
        organizationId: books.organization.id,
        connectionId,
        keyHint: sealed.keyHint,
        sealedKey: sealed.sealedKey,
        sealedSecret: sealed.sealedSecret,
      });
    }
    await tx.insert(auditEvents).values(
      auditRow(books, actor, "connection.created", "connection", connectionId, `${draft.connection.name} · read-only`),
    );
  });
}

export async function revokeConnection(books: Books, connectionId: string, actor: string): Promise<void> {
  const connection = requireConnection(books, connectionId);
  if (connection.status === "revoked") throw new BooksWriteError("This connection is already disconnected.");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(connections)
      .set({ status: "revoked", lastError: null })
      .where(and(eq(connections.id, connection.id), eq(connections.organizationId, books.organization.id)));
    await tx.insert(auditEvents).values(auditRow(books, actor, "connection.revoked", "connection", connection.id, connection.name));
  });
}

export async function recordSyncFailure(
  books: Books,
  connectionId: string,
  status: ConnectionStatus,
  lastError: string,
  actor: string,
  nextAttemptAt: Date | null = null,
): Promise<void> {
  const connection = requireConnection(books, connectionId);
  if (connection.status === "revoked") throw new BooksWriteError("This connection is disconnected.");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(connections)
      .set({ status, lastError, nextAttemptAt })
      .where(and(eq(connections.id, connection.id), eq(connections.organizationId, books.organization.id)));
    await tx.insert(auditEvents).values(auditRow(books, actor, "connection.sync_failed", "connection", connection.id, lastError));
  });
}

export async function recordSyncSuccess(
  books: Books,
  connectionId: string,
  reads: readonly { sourceId: string; balances: readonly NormalizedBalance[]; movements: readonly NormalizedSourceTransaction[] }[],
  actor: string,
): Promise<void> {
  const connection = requireConnection(books, connectionId);
  if (connection.status === "revoked") throw new BooksWriteError("This connection is disconnected.");
  const linked = new Set(books.sources.filter((source) => source.connectionId === connection.id).map((source) => source.id));
  const assetId = new Map(books.assets.map((asset) => [asset.code, asset.id]));
  const seen = new Set(books.sourceTransactions.map((transaction) => `${transaction.sourceId}:${transaction.externalId}`));
  let cursor = connection.cursor;
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const read of reads) {
      if (!linked.has(read.sourceId)) throw new BooksWriteError("That account is not on this connection.");
      const source = books.sources.find((item) => item.id === read.sourceId);
      if (!source) throw new BooksWriteError("That account is not on this connection.");
      if (read.balances.length > 0) {
        await tx.insert(balanceSnapshots).values(
          read.balances.map((balance) => {
            const resolved = assetId.get(balance.assetCode);
            if (!resolved) throw new BooksWriteError(`Unknown asset ${balance.assetCode}.`);
            if (balance.quantityMinor < 0n) throw new BooksWriteError(`Quantity for ${balance.assetCode} cannot be negative.`);
            const asOf = new Date(balance.asOf);
            if (Number.isNaN(asOf.getTime())) throw new BooksWriteError(`Balance for ${balance.assetCode} has no time.`);
            return {
              id: newId("snap"),
              organizationId: books.organization.id,
              entityId: source.entityId,
              sourceId: source.id,
              assetId: resolved,
              quantityMinor: balance.quantityMinor,
              asOf,
            };
          }),
        );
      }
      const movements = read.movements.filter((movement) => {
        const key = `${read.sourceId}:${movement.externalId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        if (movement.occurredOn > (cursor ?? "")) cursor = movement.occurredOn;
        return true;
      });
      if (movements.length > 0) {
        await tx.insert(sourceTransactions).values(
          movements.map((movement) => {
            const resolved = assetId.get(movement.assetCode);
            if (!resolved) throw new BooksWriteError(`Unknown asset ${movement.assetCode}.`);
            return {
              id: newId("stx"),
              organizationId: books.organization.id,
              entityId: source.entityId,
              sourceId: source.id,
              externalId: movement.externalId,
              occurredOn: movement.occurredOn,
              assetId: resolved,
              direction: movement.direction,
              quantityMinor: movement.quantityMinor,
              description: movement.description,
            };
          }),
        );
      }
    }
    await tx
      .update(connections)
      .set({ status: "healthy", lastError: null, lastSyncedAt: new Date(), nextAttemptAt: null, cursor })
      .where(and(eq(connections.id, connection.id), eq(connections.organizationId, books.organization.id)));
    await tx.insert(auditEvents).values(
      auditRow(books, actor, "connection.synced", "connection", connection.id, `Read ${connection.name}.`),
    );
  });
}

function requireConnection(books: Books, connectionId: string) {
  const connection = books.connections.find((item) => item.id === connectionId);
  if (!connection) throw new BooksWriteError("That connection is not in this organization.");
  return connection;
}

export async function insertJournal(books: Books, entry: PostedJournalEntry, actor: string): Promise<void> {
  if (books.journalEntries.some((existing) => existing.entityId === entry.entityId && existing.reference === entry.reference)) {
    throw new BooksWriteError(`Reference ${entry.reference} is already used for this company.`);
  }
  await persistEntry(books, entry, actor, "journal.posted", null);
}

export async function insertReversal(books: Books, entryId: string, input: { reference: string; entryDate: string; memo: string }, actor: string): Promise<void> {
  const original = books.journalEntries.find((entry) => entry.id === entryId);
  if (!original) throw new LedgerError("EMPTY_REFERENCE", "That entry is not in these books.");
  if (books.journalEntries.some((entry) => entry.reversesEntryId === original.id)) {
    throw new LedgerError("DUPLICATE_ID", `${original.reference} already has a correction.`);
  }
  const reversal = reverseJournalEntry(original, { id: newId("je"), ...input });
  await persistEntry(books, reversal, actor, "journal.reversed", original.id);
}

export async function insertFxRate(
  books: Books,
  input: {
    baseCurrency: string;
    quoteCurrency: string;
    numerator: bigint;
    scale: number;
    asOf: string;
    note: string;
  },
  actor: string,
): Promise<void> {
  if (input.numerator <= 0n) throw new BooksWriteError("The rate must be positive.");
  const id = newId("fx");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(fxRates).values({
      id,
      organizationId: books.organization.id,
      baseCurrency: input.baseCurrency,
      quoteCurrency: input.quoteCurrency,
      numerator: input.numerator,
      scale: input.scale,
      asOf: input.asOf,
      origin: books.organization.origin,
      note: input.note,
    });
    await tx.insert(auditEvents).values(
      auditRow(
        books,
        actor,
        "fx.recorded",
        "fx_rate",
        id,
        `1 ${input.baseCurrency} = ${input.numerator.toString()} / 10^${input.scale} ${input.quoteCurrency}`,
      ),
    );
  });
}

export async function insertSourceTransactions(
  books: Books,
  sourceId: string,
  rows: readonly ParsedSourceTransaction[],
  actor: string,
): Promise<number> {
  const source = books.sources.find((item) => item.id === sourceId);
  if (!source) throw new BooksWriteError("Choose a wallet, exchange, or custodian in this organization.");
  const assetId = new Map(books.assets.map((asset) => [asset.code, asset.id]));
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(sourceTransactions).values(
      rows.map((row) => {
        const resolved = assetId.get(row.assetCode);
        if (!resolved) throw new BooksWriteError(`Unknown asset ${row.assetCode}.`);
        return {
          id: newId("stx"),
          organizationId: books.organization.id,
          entityId: source.entityId,
          sourceId: source.id,
          externalId: row.externalId,
          occurredOn: row.occurredOn,
          assetId: resolved,
          direction: row.direction,
          quantityMinor: row.quantityMinor,
          description: row.description,
        };
      }),
    );
    await tx.insert(auditEvents).values(
      auditRow(books, actor, "source_transactions.imported", "source", source.id, `Imported ${rows.length} source transactions for ${source.name}.`),
    );
  });
  return rows.length;
}

async function persistEntry(
  books: Books,
  entry: PostedJournalEntry,
  actor: string,
  action: string,
  reversesEntryId: string | null,
): Promise<void> {
  const accountId = new Map(books.accounts.map((account) => [`${account.entityId}:${account.code}`, account.id]));
  const assetId = new Map(books.assets.map((asset) => [asset.code, asset.id]));
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({
      id: entry.id,
      organizationId: books.organization.id,
      entityId: entry.entityId,
      reference: entry.reference,
      entryDate: entry.entryDate,
      memo: entry.memo,
      currency: entry.currency,
      debitMinor: entry.debitMinor,
      creditMinor: entry.creditMinor,
      postedAt: new Date(),
      postedBy: actor,
      reversesEntryId,
    });
    await tx.insert(journalLines).values(
      entry.lines.map((line) => {
        const resolvedAccount = accountId.get(`${entry.entityId}:${line.accountCode}`);
        if (!resolvedAccount) throw new BooksWriteError(`Account ${line.accountCode} is not on this company.`);
        const resolvedAsset = line.assetCode ? assetId.get(line.assetCode) ?? null : null;
        if (line.assetCode && !resolvedAsset) throw new BooksWriteError(`Unknown asset ${line.assetCode}.`);
        return {
          id: `${entry.id}:${line.lineNumber}`,
          organizationId: books.organization.id,
          entryId: entry.id,
          lineNumber: line.lineNumber,
          accountId: resolvedAccount,
          side: line.side,
          amountMinor: line.amountMinor,
          currency: line.currency,
          quantityMinor: line.quantityMinor ?? null,
          quantityDirection: line.quantityDirection ?? null,
          assetId: resolvedAsset,
          sourceId: line.sourceId ?? null,
          memo: line.memo ?? null,
        };
      }),
    );
    await tx.insert(auditEvents).values(auditRow(books, actor, action, "journal_entry", entry.id, `${entry.reference} · ${entry.memo}`));
  });
}

function auditRow(books: Books, actor: string, action: string, subjectType: string, subjectId: string, detail: string) {
  return {
    id: newId("audit"),
    organizationId: books.organization.id,
    occurredAt: new Date(),
    actor,
    action,
    subjectType,
    subjectId,
    detail,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
