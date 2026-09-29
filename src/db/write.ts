import { ENTITY_CHART } from "@/data/chart-template";
import type { Books } from "@/data/books";
import type { ParsedSourceTransaction } from "@/data/source-csv";
import { LedgerError, reverseJournalEntry, type PostedJournalEntry } from "@/ledger";
import { getDb } from "./client";
import { accounts, auditEvents, entities, fxRates, journalEntries, journalLines, sourceTransactions, sources } from "./schema";

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
    throw new BooksWriteError("The parent entity is not in this organization.");
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

export async function insertSource(
  books: Books,
  input: {
    entityId: string;
    kind: "wallet" | "exchange" | "custodian";
    role: "hot" | "cold" | "staking" | null;
    name: string;
    chain: string | null;
    identifier: string;
  },
  actor: string,
): Promise<void> {
  if (!books.entities.some((entity) => entity.id === input.entityId)) {
    throw new BooksWriteError("Choose an entity in this organization.");
  }
  const id = newId("src");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(sources).values({ id, organizationId: books.organization.id, ...input });
    await tx.insert(auditEvents).values(auditRow(books, actor, "source.created", "source", id, input.name));
  });
}

export async function insertJournal(books: Books, entry: PostedJournalEntry, actor: string): Promise<void> {
  if (books.journalEntries.some((existing) => existing.entityId === entry.entityId && existing.reference === entry.reference)) {
    throw new BooksWriteError(`Reference ${entry.reference} is already used for this entity.`);
  }
  await persistEntry(books, entry, actor, "journal.posted", null);
}

export async function insertReversal(books: Books, entryId: string, input: { reference: string; entryDate: string; memo: string }, actor: string): Promise<void> {
  const original = books.journalEntries.find((entry) => entry.id === entryId);
  if (!original) throw new LedgerError("EMPTY_REFERENCE", "That journal entry is not in these books.");
  if (books.journalEntries.some((entry) => entry.reversesEntryId === original.id)) {
    throw new LedgerError("DUPLICATE_ID", `${original.reference} already has a reversal.`);
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
  if (!source) throw new BooksWriteError("Choose a source in this organization.");
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
        if (!resolvedAccount) throw new BooksWriteError(`Account ${line.accountCode} is not on this entity.`);
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
