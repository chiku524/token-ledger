import { describe, expect, it } from "vitest";
import type { SyncRunRow } from "@/db/sync-runs";
import type { BooksConnection } from "./books";
import { buildOperations, connectionHealth } from "./operations";

function connection(overrides: Partial<BooksConnection> = {}): BooksConnection {
  return {
    id: "conn_1",
    organizationId: "org_1",
    entityId: "ent_1",
    mode: "watch",
    venue: "ethereum",
    name: "Treasury",
    status: "healthy",
    scopes: "balances,movements",
    ownership: "watch_only",
    verifiedAddress: null,
    verifiedAt: null,
    cursor: null,
    lastSyncedAt: "2026-06-01T12:00:00.000Z",
    lastError: null,
    nextAttemptAt: null,
    ...overrides,
  };
}

function run(overrides: Partial<SyncRunRow> = {}): SyncRunRow {
  return {
    id: "run_1",
    connectionId: "conn_1",
    startedAt: new Date("2026-06-01T12:00:00Z"),
    finishedAt: new Date("2026-06-01T12:00:01Z"),
    status: "ok",
    trigger: "scheduled",
    balancesRead: 2,
    movementsRead: 1,
    accountsRead: 1,
    error: null,
    ...overrides,
  };
}

describe("connectionHealth", () => {
  it("treats a revoked connection as disconnected", () => {
    expect(connectionHealth(connection({ status: "revoked" }), null).level).toBe("disconnected");
  });

  it("marks a degraded connection, or a failed last run, as attention", () => {
    expect(connectionHealth(connection({ status: "degraded" }), null).level).toBe("attention");
    expect(connectionHealth(connection({ status: "healthy" }), run({ status: "failed" })).level).toBe("attention");
    expect(connectionHealth(connection({ status: "healthy" }), run({ status: "not_live" })).level).toBe("attention");
  });

  it("is waiting when pending with no failure, and ok once healthy", () => {
    expect(connectionHealth(connection({ status: "pending" }), null).level).toBe("waiting");
    expect(connectionHealth(connection({ status: "healthy" }), run()).level).toBe("ok");
  });
});

describe("buildOperations", () => {
  it("orders failing connections before healthy ones", () => {
    const connections = [
      connection({ id: "ok", status: "healthy" }),
      connection({ id: "bad", status: "degraded" }),
      connection({ id: "waiting", status: "pending" }),
    ];
    const runs = new Map<string, SyncRunRow[]>([
      ["ok", [run({ connectionId: "ok" })]],
      ["bad", [run({ connectionId: "bad", status: "failed", error: "timeout" })]],
    ]);
    const rows = buildOperations(connections, runs);
    expect(rows.map((row) => row.connection.id)).toEqual(["bad", "waiting", "ok"]);
    expect(rows[0]?.lastRun?.error).toBe("timeout");
  });

  it("keeps only the most recent runs and tolerates no history", () => {
    const many = Array.from({ length: 8 }, (_, index) => run({ id: `run_${index}` }));
    const rows = buildOperations([connection()], new Map([["conn_1", many]]));
    expect(rows[0]?.recentRuns).toHaveLength(5);
    expect(rows[0]?.lastRun?.id).toBe("run_0");

    const noHistory = buildOperations([connection()], new Map());
    expect(noHistory[0]?.lastRun).toBeNull();
  });
});
