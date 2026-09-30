import { EXAMPLE_NOTICE } from "./example-books";
import type {
  Books,
  BooksAccount,
  BooksAsset,
  BooksBalanceSnapshot,
  BooksConnection,
  BooksEntity,
  BooksSource,
  BooksSourceTransaction,
  StoredJournalEntry,
} from "./books";
import { buildReconciliations } from "./reconciliation";

export interface SnapshotOrganization {
  id: string;
  name: string;
  origin: "example" | "live";
}

export interface SnapshotLine {
  entryId: string;
  lineNumber: number;
  accountCode: string;
  side: "debit" | "credit";
  amountMinor: bigint;
  currency: string;
  quantityMinor: bigint | null;
  quantityDirection: "in" | "out" | null;
  assetCode: string | null;
  sourceId: string | null;
  memo: string | null;
}

export interface SnapshotEntry {
  id: string;
  entityId: string;
  reference: string;
  entryDate: string;
  memo: string;
  currency: string;
  debitMinor: bigint;
  creditMinor: bigint;
  postedAt: Date;
  postedBy: string;
  reversesEntryId: string | null;
}

export interface SnapshotConnection extends Omit<BooksConnection, "lastSyncedAt"> {
  lastSyncedAt: Date | null;
}

export interface SnapshotBalance extends Omit<BooksBalanceSnapshot, "asOf"> {
  asOf: Date;
}

export interface BooksSnapshot {
  organization: SnapshotOrganization;
  entities: BooksEntity[];
  assets: BooksAsset[];
  connections: SnapshotConnection[];
  sources: BooksSource[];
  balanceSnapshots: SnapshotBalance[];
  accounts: BooksAccount[];
  entries: SnapshotEntry[];
  lines: SnapshotLine[];
  sourceTransactions: BooksSourceTransaction[];
  fxRates: Books["fxRates"][number][];
  auditEvents: Array<Omit<Books["auditEvents"][number], "occurredAt"> & { occurredAt: Date }>;
}

export function mapSnapshotToBooks(snapshot: BooksSnapshot): Books {
  const linesByEntry = new Map<string, SnapshotLine[]>();
  for (const line of snapshot.lines) {
    const list = linesByEntry.get(line.entryId) ?? [];
    list.push(line);
    linesByEntry.set(line.entryId, list);
  }

  const journalEntries: StoredJournalEntry[] = snapshot.entries
    .slice()
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.reference.localeCompare(b.reference))
    .map((entry) => {
      const lines = (linesByEntry.get(entry.id) ?? []).slice().sort((a, b) => a.lineNumber - b.lineNumber);
      return {
        id: entry.id,
        entityId: entry.entityId,
        reference: entry.reference,
        entryDate: entry.entryDate,
        memo: entry.memo,
        currency: entry.currency,
        debitMinor: entry.debitMinor,
        creditMinor: entry.creditMinor,
        postedBy: entry.postedBy,
        postedAt: entry.postedAt.toISOString(),
        reversesEntryId: entry.reversesEntryId,
        lines: lines.map((line) => ({
          lineNumber: line.lineNumber,
          accountCode: line.accountCode,
          side: line.side,
          amountMinor: line.amountMinor,
          currency: line.currency,
          quantityMinor: line.quantityMinor ?? undefined,
          quantityDirection: line.quantityDirection ?? undefined,
          assetCode: line.assetCode ?? undefined,
          sourceId: line.sourceId ?? undefined,
          memo: line.memo ?? undefined,
        })),
      };
    });

  const dates = journalEntries.map((entry) => entry.entryDate).sort();
  const start = dates[0] ?? "2026-01-01";
  const end = dates.at(-1) ?? start;
  const period = { start, end, label: start === end ? start : `${start} – ${end}` };

  return {
    notice: snapshot.organization.origin === "example" ? EXAMPLE_NOTICE : `Live books for ${snapshot.organization.name}, read from Postgres.`,
    period,
    organization: snapshot.organization,
    entities: snapshot.entities,
    assets: snapshot.assets,
    connections: snapshot.connections.map((connection) => ({
      ...connection,
      lastSyncedAt: connection.lastSyncedAt ? connection.lastSyncedAt.toISOString() : null,
    })),
    sources: snapshot.sources,
    balanceSnapshots: snapshot.balanceSnapshots.map((snapshotRow) => ({
      ...snapshotRow,
      asOf: snapshotRow.asOf.toISOString(),
    })),
    accounts: snapshot.accounts,
    journalEntries,
    sourceTransactions: snapshot.sourceTransactions,
    reconciliations: buildReconciliations(snapshot.organization.id, snapshot.sourceTransactions, journalEntries, start),
    fxRates: snapshot.fxRates,
    auditEvents: snapshot.auditEvents
      .map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() }))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  };
}
