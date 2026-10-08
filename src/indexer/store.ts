/**
 * The database-backed `IndexerStore`. Wraps the existing `db/indexer` writes so
 * the pure pass in `pass.ts` stays testable without a database.
 */
import { recordChainEvent, readCursor, writeCursor } from "@/db/indexer";
import type { IndexerStore, RecordedEvent } from "./pass";

export function databaseIndexerStore(): IndexerStore {
  return {
    readCursor: (cluster, programId) => readCursor(cluster, programId),
    writeCursor: (cluster, programId, lastSlot) => writeCursor(cluster, programId, lastSlot),
    recordEvent: (event: RecordedEvent) =>
      recordChainEvent({
        organizationId: null,
        cluster: event.cluster,
        signature: event.signature,
        instructionIndex: event.instructionIndex,
        eventOrdinal: event.eventOrdinal,
        programId: event.programId,
        name: event.name,
        payload: event.payload,
        slot: event.slot,
        blockTime: event.blockTime,
      }),
  };
}
