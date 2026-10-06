import { cache } from "react";
import type { SessionUser } from "@/auth/current";
import type { SyncRunRow } from "@/db/sync-runs";
import { loadAuthorizedBooks } from "./authorized-books";
import type { BooksEntity } from "./books";
import { buildOperations, type ConnectionOperations } from "./operations";
import { booksAreWritable } from "./load-books";
import { deriveChainHealth, type ChainHealth } from "./chain-health";

/**
 * The operations view's data. Run history lives only in the database, so with
 * the example books there are no runs and every connection shows its own
 * status. Scoped to the signed-in organization by `loadAuthorizedBooks`.
 */
export const loadOperations = cache(
  async (): Promise<{
    session: SessionUser;
    writable: boolean;
    entities: readonly BooksEntity[];
    queuedEvents: number;
    rows: ConnectionOperations[];
    chain: ChainHealth | null;
  }> => {
    const { session, books } = await loadAuthorizedBooks();
    let runs = new Map<string, SyncRunRow[]>();
    let queuedEvents = 0;
    let chain: ChainHealth | null = null;
    const writable = booksAreWritable();
    if (writable) {
      const [{ recentRunsByOrganization }, { queuedMatchJobCount }, { recentChainTransactions, organizationOutbox, chainCursorRows }] =
        await Promise.all([
          import("@/db/sync-runs"),
          import("@/db/webhooks"),
          import("@/db/chain-ops"),
        ]);
      [runs, queuedEvents] = await Promise.all([
        recentRunsByOrganization(session.organizationId, 5),
        queuedMatchJobCount(session.organizationId),
      ]);
      const [transactions, outbox, cursors] = await Promise.all([
        recentChainTransactions(session.organizationId),
        organizationOutbox(session.organizationId),
        chainCursorRows(),
      ]);
      chain = deriveChainHealth({ transactions, outbox, cursors }, new Date());
    }
    return { session, writable, entities: books.entities, queuedEvents, rows: buildOperations(books.connections, runs), chain };
  },
);
