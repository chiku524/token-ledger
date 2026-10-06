import { describe, expect, it } from "vitest";
import {
  canonicalMovementKey,
  internalTransferLink,
  isBypassedDeposit,
  isUnsolicitedDeposit,
  mergeObservations,
  type CanonicalMovementId,
} from "./canonical";
import { advanceCursor, dedupeNotifications, isFinalized, planBackfill } from "./backfill";
import { decodeEventsFromLogs, discriminatorOf } from "./events";
import { toBase64 } from "@/lib/webcrypto";

describe("canonical movement identity", () => {
  const id: CanonicalMovementId = { cluster: "devnet", signature: "sig1", location: { instructionIndex: 2, innerPath: [] } };

  it("is stable and includes the inner path", () => {
    const inner: CanonicalMovementId = { ...id, location: { instructionIndex: 2, innerPath: [0, 1] } };
    expect(canonicalMovementKey(id)).toBe("devnet:sig1:2");
    expect(canonicalMovementKey(inner)).toBe("devnet:sig1:2:0.1");
  });

  it("merges two observations of the same movement into one, flagging gross-vs-net", () => {
    const merged = mergeObservations(id, [
      { source: "wallet_reader", assetCode: "SOL", direction: "out", quantityMinor: 1_000n, owner: "A" },
      { source: "program_indexer", assetCode: "SOL", direction: "out", quantityMinor: 1_200n, owner: "A" },
    ]);
    expect(merged.quantityMinor).toBe(1_200n);
    expect(merged.ambiguous).toBe(true);
    expect(merged.sources).toEqual(["wallet_reader", "program_indexer"]);
  });

  it("refuses observations that disagree on asset or direction", () => {
    expect(() =>
      mergeObservations(id, [
        { source: "wallet_reader", assetCode: "SOL", direction: "out", quantityMinor: 1n, owner: "A" },
        { source: "program_indexer", assetCode: "USDC", direction: "out", quantityMinor: 1n, owner: "A" },
      ]),
    ).toThrow(/disagree/i);
  });
});

describe("internal transfers and vault funding", () => {
  it("links an internal transfer when both sides share an entity", () => {
    expect(internalTransferLink("k", "e1", "e1").internal).toBe(true);
    expect(internalTransferLink("k", "e1", "e2").internal).toBe(false);
  });

  it("detects an unsolicited (instruction-bypassed) deposit", () => {
    expect(
      isUnsolicitedDeposit({ vaultAddress: "v", assetCode: "USDC", deltaMinor: 500n, causedBy: null }),
    ).toBe(true);
    expect(
      isUnsolicitedDeposit({ vaultAddress: "v", assetCode: "USDC", deltaMinor: 500n, causedBy: { signature: "s", location: { instructionIndex: 0, innerPath: [] } } }),
    ).toBe(false);
  });

  it("treats a different program's instruction as a bypassed deposit", () => {
    const obs = { vaultAddress: "v", assetCode: "USDC", deltaMinor: 500n, causedBy: { signature: "s", location: { instructionIndex: 0, innerPath: [] } } };
    expect(isBypassedDeposit(obs, "ourProgram", "otherProgram")).toBe(true);
    expect(isBypassedDeposit(obs, "ourProgram", "ourProgram")).toBe(false);
  });
});

describe("event decoding", () => {
  it("decodes a CycleCollected log line", () => {
    // discriminator + mandate(32) + cycle(u64) + amount(u64) + start(i64) + end(i64)
    const mandate = new Uint8Array(32).fill(7);
    const body = new Uint8Array(8 + 32 + 8 + 8 + 8 + 8);
    body.set(discriminatorOf("CycleCollected"), 0);
    body.set(mandate, 8);
    const view = new DataView(body.buffer);
    view.setBigUint64(40, 3n, true);
    view.setBigUint64(48, 20_000_000n, true);
    const line = `Program data: ${toBase64(body)}`;

    const events = decodeEventsFromLogs([line, "Program log: unrelated"]);
    expect(events).toHaveLength(1);
    expect(events[0]!.name).toBe("CycleCollected");
    expect(events[0]!.fields.cycle).toBe(3n);
    expect(events[0]!.fields.amount).toBe(20_000_000n);
  });

  it("ignores a line that is not a known event", () => {
    const body = new Uint8Array(8 + 32);
    body.fill(0xff);
    expect(decodeEventsFromLogs([`Program data: ${toBase64(body)}`])).toHaveLength(0);
  });
});

describe("backfill", () => {
  it("plans forward from the cursor, never past finality", () => {
    const cursor = { cluster: "devnet", programId: "p", lastSlot: 100n };
    const plan = planBackfill(cursor, { finalizedSlot: 250n, maxSpanSlots: 100n });
    expect(plan).toEqual({ fromSlot: 100n, toSlot: 200n, spanSlots: 100n, hasWork: true });
    expect(advanceCursor(cursor, plan).lastSlot).toBe(200n);
  });

  it("has no work when the cursor is at or ahead of finality", () => {
    const plan = planBackfill({ cluster: "devnet", programId: "p", lastSlot: 300n }, { finalizedSlot: 250n, maxSpanSlots: 100n });
    expect(plan.hasWork).toBe(false);
  });

  it("does not move the cursor backwards when the cursor is ahead of finality", () => {
    // A reorg can leave the cursor ahead of the canonical finalized height. The
    // scan must stall, not advance, and never rewind on its own.
    const cursor = { cluster: "devnet", programId: "p", lastSlot: 300n };
    const plan = planBackfill(cursor, { finalizedSlot: 260n, maxSpanSlots: 100n });
    expect(plan).toEqual({ fromSlot: 300n, toSlot: 260n, spanSlots: 0n, hasWork: false });
    expect(advanceCursor(cursor, plan).lastSlot).toBe(300n);
  });

  it("trusts only at-or-below finality", () => {
    expect(isFinalized(200n, 250n)).toBe(true);
    expect(isFinalized(260n, 250n)).toBe(false);
  });

  it("dedupes repeated notifications by cluster+signature+ordinal", () => {
    const seen = new Set<string>();
    const incoming = [
      { cluster: "devnet", signature: "s1", ordinal: 0 },
      { cluster: "devnet", signature: "s1", ordinal: 0 },
      { cluster: "devnet", signature: "s1", ordinal: 1 },
    ];
    const first = dedupeNotifications(seen, incoming);
    expect(first.fresh).toHaveLength(2);
    const second = dedupeNotifications(new Set(first.keys), incoming);
    expect(second.fresh).toHaveLength(0);
  });
});
