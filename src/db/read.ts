import { asc, eq } from "drizzle-orm";
import { mapSnapshotToBooks, type BooksSnapshot, type SnapshotLine } from "@/data/map-books";
import { pickOrganization } from "@/data/pick-organization";
import type { Books } from "@/data/books";
import { getDb } from "./client";
import {
  accounts,
  assets,
  auditEvents,
  balanceSnapshots,
  connections,
  entities,
  fxRates,
  journalEntries,
  journalLines,
  organizations,
  sourceTransactions,
  sources,
} from "./schema";

export async function loadBooksFromDatabase(requestedOrganizationId?: string): Promise<Books> {
  const db = getDb();
  const organization = requestedOrganizationId
    ? (await db.select().from(organizations).where(eq(organizations.id, requestedOrganizationId)).limit(1))[0]
    : pickOrganization(await db.select().from(organizations).orderBy(asc(organizations.createdAt)));
  if (!organization) {
    throw new Error(
      requestedOrganizationId
        ? "This account’s books are not in the database."
        : "No books are saved yet. Load the example, or add an organization.",
    );
  }

  const organizationId = organization.id;
  const [entityRows, assetRows, connectionRows, sourceRows, snapshotRows, accountRows, entryRows, lineRows, transactionRows, rateRows, auditRows] =
    await Promise.all([
      db.select().from(entities).where(eq(entities.organizationId, organizationId)),
      db.select().from(assets).where(eq(assets.organizationId, organizationId)),
      db.select().from(connections).where(eq(connections.organizationId, organizationId)),
      db.select().from(sources).where(eq(sources.organizationId, organizationId)),
      db.select().from(balanceSnapshots).where(eq(balanceSnapshots.organizationId, organizationId)),
      db.select().from(accounts).where(eq(accounts.organizationId, organizationId)),
      db.select().from(journalEntries).where(eq(journalEntries.organizationId, organizationId)),
      db.select().from(journalLines).where(eq(journalLines.organizationId, organizationId)),
      db.select().from(sourceTransactions).where(eq(sourceTransactions.organizationId, organizationId)),
      db.select().from(fxRates).where(eq(fxRates.organizationId, organizationId)),
      db.select().from(auditEvents).where(eq(auditEvents.organizationId, organizationId)),
    ]);

  const accountCode = new Map(accountRows.map((account) => [account.id, account.code]));
  const assetCode = new Map(assetRows.map((asset) => [asset.id, asset.code]));

  const lines: SnapshotLine[] = lineRows.map((line) => {
    const code = accountCode.get(line.accountId);
    if (!code) throw new Error(`Journal line ${line.id} points at a missing account.`);
    const resolvedAsset = line.assetId ? assetCode.get(line.assetId) : null;
    if (line.assetId && !resolvedAsset) throw new Error(`Journal line ${line.id} points at a missing asset.`);
    return {
      entryId: line.entryId,
      lineNumber: line.lineNumber,
      accountCode: code,
      side: line.side,
      amountMinor: line.amountMinor,
      currency: line.currency,
      quantityMinor: line.quantityMinor,
      quantityDirection: line.quantityDirection,
      assetCode: resolvedAsset ?? null,
      sourceId: line.sourceId,
      memo: line.memo,
    };
  });

  const snapshot: BooksSnapshot = {
    organization: { id: organization.id, name: organization.name, origin: organization.origin },
    entities: entityRows,
    assets: assetRows,
    connections: connectionRows.map((connection) => ({
      id: connection.id,
      organizationId: connection.organizationId,
      entityId: connection.entityId,
      mode: connection.mode,
      venue: connection.venue,
      name: connection.name,
      status: connection.status,
      scopes: connection.scopes,
      cursor: connection.cursor,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
    })),
    sources: sourceRows,
    balanceSnapshots: snapshotRows.map((row) => {
      const code = assetCode.get(row.assetId);
      if (!code) throw new Error(`Balance snapshot ${row.id} points at a missing asset.`);
      return {
        id: row.id,
        organizationId: row.organizationId,
        entityId: row.entityId,
        sourceId: row.sourceId,
        assetCode: code,
        quantityMinor: row.quantityMinor,
        asOf: row.asOf,
      };
    }),
    accounts: accountRows.map((account) => ({ ...account, ifrsNote: account.ifrsNote ?? "" })),
    entries: entryRows.map((entry) => ({
      id: entry.id,
      entityId: entry.entityId,
      reference: entry.reference,
      entryDate: entry.entryDate,
      memo: entry.memo,
      currency: entry.currency,
      debitMinor: entry.debitMinor,
      creditMinor: entry.creditMinor,
      postedAt: entry.postedAt,
      postedBy: entry.postedBy,
      reversesEntryId: entry.reversesEntryId,
    })),
    lines,
    sourceTransactions: transactionRows.map((transaction) => {
      const code = assetCode.get(transaction.assetId);
      if (!code) throw new Error(`Source transaction ${transaction.id} points at a missing asset.`);
      return {
        id: transaction.id,
        organizationId: transaction.organizationId,
        entityId: transaction.entityId,
        sourceId: transaction.sourceId,
        externalId: transaction.externalId,
        occurredOn: transaction.occurredOn,
        assetCode: code,
        direction: transaction.direction,
        quantityMinor: transaction.quantityMinor,
        description: transaction.description,
      };
    }),
    fxRates: rateRows,
    auditEvents: auditRows,
  };

  return mapSnapshotToBooks(snapshot);
}
