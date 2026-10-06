import { describe, expect, it } from "vitest";
import type { IndexerCursor } from "./backfill";
import { runIndexerPass, type ChainSource, type FinalizedTransaction, type IndexerStore, type RecordedEvent } from "./pass";
import { BILLING_EVENT_DISCRIMINATORS } from "./events";
import { toBase64 } from "@/lib/webcrypto";

const PROGRAM = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";

/** An in-memory store: a cursor and a set of recorded event keys. */
function memoryStore(cursor: IndexerCursor): { store: IndexerStore; recorded: Set<string>; cursor: () => bigint } {
  const recorded = new Set<string>();
  let lastSlot = cursor.lastSlot;
  const store: IndexerStore = {
    async readCursor() {
      return { ...cursor, lastSlot };
    },
    async writeCursor(_cluster, _programId, slot) {
      if (slot > lastSlot) lastSlot = slot;
    },
    async recordEvent(event: RecordedEvent) {
      if (recorded.has(event.key)) return false;
      recorded.add(event.key);
      return true;
    },
  };
  return { store, recorded, cursor: () => lastSlot };
}

function cycleCollectedLog(cycle: bigint): string {
  const body = new Uint8Array(8 + 32 + 8 + 8 + 8 + 8);
  body.set(BILLING_EVENT_DISCRIMINATORS.CycleCollected, 0);
  body.fill(7, 8, 40);
  const view = new DataView(body.buffer);
  view.setBigUint64(40, cycle, true);
  view.setBigUint64(48, 20_000_000n, true);
  return `Program data: ${toBase64(body)}`;
}

function source(finalized: bigint, transactions: FinalizedTransaction[]): ChainSource {
  return {
    finalizedSlot: async () => finalized,
    transactionsInRange: async (_programId, from, to) => transactions.filter((t) => t.slot > from && t.slot <= to),
  };
}

const emptyStoreCursor: IndexerCursor = { cluster: "devnet", programId: PROGRAM, lastSlot: 0n };

describe("runIndexerPass", () => {
  it("scans to finality, decodes events, and advances the cursor", async () => {
    const { store, recorded, cursor } = memoryStore(emptyStoreCursor);
    const summary = await runIndexerPass(
      {
        source: source(100n, [
          { signature: "s1", slot: 90n, blockTime: null, logs: [cycleCollectedLog(1n)], programId: PROGRAM },
        ]),
        store,
      },
      { cluster: "devnet", programId: PROGRAM, maxSpanSlots: 200n },
    );
    expect(summary).toMatchObject({ hasWork: true, scanned: 1, decoded: 1, inserted: 1 });
    expect(recorded.size).toBe(1);
    expect(cursor()).toBe(100n);
  });

  it("does not project a slot above finality", async () => {
    const { store, recorded, cursor } = memoryStore(emptyStoreCursor);
    const summary = await runIndexerPass(
      {
        source: source(50n, [
          // A transaction at slot 80 is above finality (50) and must not be pulled.
          { signature: "s1", slot: 80n, blockTime: null, logs: [cycleCollectedLog(1n)], programId: PROGRAM },
        ]),
        store,
      },
      { cluster: "devnet", programId: PROGRAM, maxSpanSlots: 200n },
    );
    // The pass had range to scan but the above-finality tx was not included.
    expect(summary.scanned).toBe(0);
    expect(recorded.size).toBe(0);
    // The cursor advances only to finality, never to the un-finalized slot.
    expect(cursor()).toBe(50n);
  });

  it("records a redelivered event once", async () => {
    const { store, recorded } = memoryStore(emptyStoreCursor);
    const tx = { signature: "s1", slot: 10n, blockTime: null, logs: [cycleCollectedLog(1n)], programId: PROGRAM };
    await runIndexerPass({ source: source(20n, [tx]), store }, { cluster: "devnet", programId: PROGRAM });
    // Point the same source at a higher finalized slot with the same tx (a replay).
    await runIndexerPass({ source: source(30n, [{ ...tx, slot: 25n }]), store }, { cluster: "devnet", programId: PROGRAM });
    expect(recorded.size).toBe(1);
  });

  it("stalls without work when the cursor is at finality", async () => {
    const { store, cursor } = memoryStore({ ...emptyStoreCursor, lastSlot: 100n });
    const summary = await runIndexerPass({ source: source(100n, []), store }, { cluster: "devnet", programId: PROGRAM });
    expect(summary).toMatchObject({ hasWork: false, inserted: 0 });
    expect(cursor()).toBe(100n);
  });

  it("decodes two events in one transaction into two ordinals", async () => {
    const { store, recorded } = memoryStore(emptyStoreCursor);
    const summary = await runIndexerPass(
      {
        source: source(30n, [
          { signature: "s1", slot: 20n, blockTime: null, logs: [cycleCollectedLog(1n), cycleCollectedLog(2n)], programId: PROGRAM },
        ]),
        store,
      },
      { cluster: "devnet", programId: PROGRAM },
    );
    expect(summary.decoded).toBe(2);
    expect(summary.inserted).toBe(2);
    expect(recorded.size).toBe(2);
  });
});
