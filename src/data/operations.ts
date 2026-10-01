/**
 * The operations view's view-model: one row per connection, ordered so a
 * failing connection is seen first. Pure so ordering and the health label can
 * be tested without a database.
 */
import type { SyncRunRow } from "@/db/sync-runs";
import type { BooksConnection } from "./books";

export type HealthLevel = "attention" | "waiting" | "ok" | "disconnected";

export interface ConnectionHealth {
  level: HealthLevel;
  label: string;
}

const LEVEL_LABEL: Record<HealthLevel, string> = {
  attention: "Needs attention",
  waiting: "Waiting",
  ok: "Up to date",
  disconnected: "Disconnected",
};

/** Rank for ordering: a problem outranks a quiet connection. */
const LEVEL_RANK: Record<HealthLevel, number> = { attention: 0, waiting: 1, ok: 2, disconnected: 3 };

export function connectionHealth(
  connection: Pick<BooksConnection, "status">,
  lastRun: Pick<SyncRunRow, "status"> | null,
): ConnectionHealth {
  if (connection.status === "revoked") return { level: "disconnected", label: LEVEL_LABEL.disconnected };
  if (connection.status === "degraded") return { level: "attention", label: LEVEL_LABEL.attention };
  if (lastRun && (lastRun.status === "failed" || lastRun.status === "not_live")) {
    return { level: "attention", label: LEVEL_LABEL.attention };
  }
  if (connection.status === "pending") return { level: "waiting", label: LEVEL_LABEL.waiting };
  return { level: "ok", label: LEVEL_LABEL.ok };
}

export interface ConnectionOperations {
  connection: BooksConnection;
  health: ConnectionHealth;
  lastRun: SyncRunRow | null;
  recentRuns: SyncRunRow[];
}

/** Build the ordered operations rows. Failing connections come first. */
export function buildOperations(
  connections: readonly BooksConnection[],
  runsByConnection: ReadonlyMap<string, SyncRunRow[]>,
): ConnectionOperations[] {
  return connections
    .map<ConnectionOperations>((connection) => {
      const runs = runsByConnection.get(connection.id) ?? [];
      const lastRun = runs[0] ?? null;
      return { connection, health: connectionHealth(connection, lastRun), lastRun, recentRuns: runs.slice(0, 5) };
    })
    .sort((left, right) => {
      const byLevel = LEVEL_RANK[left.health.level] - LEVEL_RANK[right.health.level];
      if (byLevel !== 0) return byLevel;
      const leftAt = left.lastRun ? left.lastRun.startedAt.getTime() : 0;
      const rightAt = right.lastRun ? right.lastRun.startedAt.getTime() : 0;
      return rightAt - leftAt;
    });
}
