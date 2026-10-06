import { describe, expect, it } from "vitest";
import { deriveChainHealth, INDEXER_STALE_SECONDS, type ChainTransactionRow, type OutboxRow } from "./chain-health";

const NOW = new Date("2026-06-15T12:00:00Z");
const at = (iso: string) => new Date(iso);

function tx(overrides: Partial<ChainTransactionRow>): ChainTransactionRow {
  return {
    id: "tx",
    kind: "treasury.execute",
    attempt: 1,
    signature: null,
    submittedAt: null,
    finalizedAt: null,
    error: null,
    createdAt: at("2026-06-15T11:59:00Z"),
    ...overrides,
  };
}

describe("deriveChainHealth", () => {
  it("classifies execution rows and never calls a submitted row settled", () => {
    const health = deriveChainHealth(
      {
        transactions: [
          tx({ id: "a" }),
          tx({ id: "b", signature: "sig", submittedAt: at("2026-06-15T11:59:30Z") }),
          tx({ id: "c", signature: "sig", finalizedAt: at("2026-06-15T11:58:00Z") }),
          tx({ id: "d", error: "reverted" }),
        ],
        outbox: [],
        cursors: [],
      },
      NOW,
    );
    expect(health.execution).toMatchObject({ awaitingSubmission: 1, awaitingFinality: 1, finalized: 1, failed: 1 });
    // The oldest pending row is the awaiting-submission one, created 60s ago.
    expect(health.execution.oldestPendingSeconds).toBe(60);
  });

  it("counts outbox work by state", () => {
    const job = (overrides: Partial<OutboxRow>): OutboxRow => ({
      id: "job",
      kind: "chain.submit",
      attempts: 0,
      availableAt: at("2026-06-15T11:59:00Z"),
      leasedAt: null,
      lastError: null,
      completedAt: null,
      ...overrides,
    });
    const health = deriveChainHealth(
      {
        transactions: [],
        outbox: [
          job({ id: "p" }),
          job({ id: "l", leasedAt: at("2026-06-15T11:59:30Z") }),
          job({ id: "f", attempts: 3, lastError: "rpc down" }),
          job({ id: "done", completedAt: at("2026-06-15T11:00:00Z") }),
        ],
        cursors: [],
      },
      NOW,
    );
    expect(health.outbox).toEqual({ pending: 1, leased: 1, failed: 1, completed: 1 });
  });

  it("flags a stale indexer when a cursor has not advanced", () => {
    const health = deriveChainHealth(
      {
        transactions: [],
        outbox: [],
        cursors: [
          { cluster: "devnet", programId: "p1", cursor: "100", updatedAt: at("2026-06-15T11:00:00Z") },
          { cluster: "devnet", programId: "p2", cursor: "200", updatedAt: at("2026-06-15T11:59:00Z") },
        ],
      },
      NOW,
    );
    expect(health.indexer.worstLagSeconds).toBe(60 * 60);
    expect(health.indexer.stale).toBe(true);
    expect(health.indexer.rows[0]!.programId).toBe("p1");
    expect(INDEXER_STALE_SECONDS).toBe(900);
  });

  it("is not stale without cursors", () => {
    const health = deriveChainHealth({ transactions: [], outbox: [], cursors: [] }, NOW);
    expect(health.indexer.worstLagSeconds).toBeNull();
    expect(health.indexer.stale).toBe(false);
  });
});
