/**
 * Load the fictional Harbourline example into Postgres.
 * Re-running replaces that organization and its rows. It does not touch other organizations.
 */
import { existsSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { exampleBooks } from "../data/example-books";
import { closeDb, getDb } from "./client";
import {
  accounts,
  assets,
  entities,
  journalEntries,
  journalLines,
  organizations,
  reconciliationRecords,
  sourceTransactions,
  sources,
} from "./schema";

loadEnvFile();

async function main() {
  const db = getDb();
  const books = exampleBooks;
  const organizationId = books.organization.id;

  await db.transaction(async (tx) => {
    await tx.delete(reconciliationRecords).where(eq(reconciliationRecords.organizationId, organizationId));
    await tx.delete(sourceTransactions).where(eq(sourceTransactions.organizationId, organizationId));
    await tx.delete(journalLines).where(eq(journalLines.organizationId, organizationId));
    await tx.delete(journalEntries).where(eq(journalEntries.organizationId, organizationId));
    await tx.delete(accounts).where(eq(accounts.organizationId, organizationId));
    await tx.delete(sources).where(eq(sources.organizationId, organizationId));
    await tx.delete(assets).where(eq(assets.organizationId, organizationId));
    await tx.delete(entities).where(eq(entities.organizationId, organizationId));
    await tx.delete(organizations).where(eq(organizations.id, organizationId));

    await tx.insert(organizations).values(books.organization);
    await tx.insert(entities).values(books.entities[0]);
    if (books.entities[1]) await tx.insert(entities).values(books.entities[1]);
    await tx.insert(assets).values([...books.assets]);
    await tx.insert(sources).values([...books.sources]);
    await tx.insert(accounts).values(books.accounts);

    await tx.insert(journalEntries).values(
      books.journalEntries.map((entry) => ({
        id: entry.id,
        organizationId,
        entityId: entry.entityId,
        reference: entry.reference,
        entryDate: entry.entryDate,
        memo: entry.memo,
        currency: entry.currency,
        debitMinor: entry.debitMinor,
        creditMinor: entry.creditMinor,
        postedAt: new Date(`${entry.entryDate}T00:00:00.000Z`),
      })),
    );

    const accountId = new Map(books.accounts.map((account) => [`${account.entityId}:${account.code}`, account.id]));
    const assetId = new Map(books.assets.map((asset) => [asset.code, asset.id]));

    await tx.insert(journalLines).values(
      books.journalEntries.flatMap((entry) =>
        entry.lines.map((line) => {
          const resolvedAccount = accountId.get(`${entry.entityId}:${line.accountCode}`);
          if (!resolvedAccount) {
            throw new Error(`No account ${line.accountCode} for ${entry.entityId}.`);
          }
          const resolvedAsset = line.assetCode ? assetId.get(line.assetCode) : null;
          if (line.assetCode && !resolvedAsset) throw new Error(`No asset ${line.assetCode}.`);
          return {
            id: `${entry.id}:${line.lineNumber}`,
            organizationId,
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
      ),
    );

    await tx.insert(sourceTransactions).values(
      books.sourceTransactions.map((transaction) => {
        const resolvedAsset = assetId.get(transaction.assetCode);
        if (!resolvedAsset) throw new Error(`No asset ${transaction.assetCode}.`);
        return {
          id: transaction.id,
          organizationId,
          entityId: transaction.entityId,
          sourceId: transaction.sourceId,
          externalId: transaction.externalId,
          occurredOn: transaction.occurredOn,
          assetId: resolvedAsset,
          direction: transaction.direction,
          quantityMinor: transaction.quantityMinor,
          description: transaction.description,
        };
      }),
    );

    await tx.insert(reconciliationRecords).values(
      books.reconciliations.map((record) => {
        const resolvedAsset = assetId.get(record.assetCode);
        if (!resolvedAsset) throw new Error(`No asset ${record.assetCode}.`);
        return {
          id: record.id,
          organizationId,
          entityId: record.entityId,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          status: record.status,
          sourceId: record.sourceId,
          assetId: resolvedAsset,
          direction: record.direction,
          quantityMinor: record.quantityMinor,
          sourceTransactionId: record.sourceTransactionId,
          journalEntryId: record.journalEntryId,
          journalLineNumber: record.journalLineNumber,
          note: record.note,
        };
      }),
    );
  });

  console.log(`Seeded example organization "${books.organization.name}" (${organizationId}).`);
}

function loadEnvFile() {
  if (process.env.DATABASE_URL || !existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await closeDb();
    process.exitCode = 1;
  });
