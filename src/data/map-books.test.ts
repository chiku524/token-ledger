import { describe, expect, it } from "vitest";
import { exampleBooks } from "./example-books";
import { mapSnapshotToBooks, type BooksSnapshot } from "./map-books";
import { pickOrganization } from "./pick-organization";

describe("mapSnapshotToBooks", () => {
  it("rebuilds reconciliation from stored rows, including the example exception", () => {
    const books = mapSnapshotToBooks(snapshotFromExample());
    expect(books.organization.origin).toBe("example");
    expect(books.journalEntries).toHaveLength(exampleBooks.journalEntries.length);
    expect(books.journalEntries[0]?.postedBy).toBe("example books");
    expect(books.reconciliations.filter((row) => row.status === "exception")).toEqual([
      expect.objectContaining({ sourceTransactionId: "stx_my_unbooked", journalEntryId: null }),
    ]);
    expect(books.fxRates[0]?.note.toLowerCase()).toContain("example");
  });
});

describe("pickOrganization", () => {
  it("prefers a live organization over a newer example one", () => {
    const chosen = pickOrganization([
      { id: "ex", origin: "example" as const, createdAt: new Date("2026-06-02") },
      { id: "old-live", origin: "live" as const, createdAt: new Date("2026-01-01") },
      { id: "new-live", origin: "live" as const, createdAt: new Date("2026-05-01") },
    ]);
    expect(chosen?.id).toBe("new-live");
    expect(pickOrganization([])).toBeNull();
  });
});

function snapshotFromExample(): BooksSnapshot {
  return {
    organization: exampleBooks.organization,
    entities: [...exampleBooks.entities],
    assets: [...exampleBooks.assets],
    connections: exampleBooks.connections.map((connection) => ({
      ...connection,
      lastSyncedAt: connection.lastSyncedAt ? new Date(connection.lastSyncedAt) : null,
      nextAttemptAt: connection.nextAttemptAt ? new Date(connection.nextAttemptAt) : null,
    })),
    sources: [...exampleBooks.sources],
    balanceSnapshots: exampleBooks.balanceSnapshots.map((snapshot) => ({
      ...snapshot,
      asOf: new Date(snapshot.asOf),
    })),
    accounts: [...exampleBooks.accounts],
    entries: exampleBooks.journalEntries.map((entry) => ({
      id: entry.id,
      entityId: entry.entityId,
      reference: entry.reference,
      entryDate: entry.entryDate,
      memo: entry.memo,
      currency: entry.currency,
      debitMinor: entry.debitMinor,
      creditMinor: entry.creditMinor,
      postedAt: new Date(entry.postedAt),
      postedBy: entry.postedBy,
      reversesEntryId: entry.reversesEntryId,
    })),
    lines: exampleBooks.journalEntries.flatMap((entry) =>
      entry.lines.map((line) => ({
        entryId: entry.id,
        lineNumber: line.lineNumber,
        accountCode: line.accountCode,
        side: line.side,
        amountMinor: line.amountMinor,
        currency: line.currency,
        quantityMinor: line.quantityMinor ?? null,
        quantityDirection: line.quantityDirection ?? null,
        assetCode: line.assetCode ?? null,
        sourceId: line.sourceId ?? null,
        memo: line.memo ?? null,
      })),
    ),
    sourceTransactions: [...exampleBooks.sourceTransactions],
    fxRates: [...exampleBooks.fxRates],
    auditEvents: exampleBooks.auditEvents.map((event) => ({ ...event, occurredAt: new Date(event.occurredAt) })),
  };
}
