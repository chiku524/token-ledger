import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { ConnectionControls, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadOperations } from "@/data/load-operations";
import { entityName, syncRunStatusLabel, syncRunTriggerLabel, venueLabel } from "@/data/present";
import { one } from "@/data/query";

export const metadata = { title: "Operations" };

const LEVEL_CLASS: Record<string, string> = {
  attention: "text-seal",
  waiting: "text-ink-soft",
  ok: "text-pine",
  disconnected: "text-ink-soft",
};

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, writable, entities, queuedEvents, rows } = await loadOperations();
  const canSource = can(session.role, "source.write");
  const csrf = await ensureCsrf();

  return (
    <>
      <PageHeader
        kicker="Connector health"
        title="Operations"
        description="Every connection, its last pull, and what it read. A failing connection is shown first so it is not missed. A manual re-run here is the same read the scheduler makes."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />

      <section className="panel p-4">
        <h2 className="text-lg font-semibold tracking-tight">How scheduled sync works</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          A scheduler pulls every due connection on an interval and records each run here. A run that fails is retried with
          a growing backoff, and a connection that keeps failing is marked degraded. Every pull is read-only and never posts
          a journal. Each run keeps its counts; raw payloads are retained for the most recent runs and then age out.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {queuedEvents === 0
            ? "No signed events are waiting to be matched."
            : `${queuedEvents} signed ${queuedEvents === 1 ? "event is" : "events are"} waiting to be matched.`}
        </p>
      </section>

      {rows.length === 0 ? (
        <p className="mt-8 panel px-4 py-6 text-sm text-ink-soft">
          No connections yet. Add one in{" "}
          <Link href="/dashboard/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">Connector health</caption>
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Connection</th>
                <th scope="col">Health</th>
                <th scope="col">Last run</th>
                <th scope="col" className="num">Balances</th>
                <th scope="col" className="num">Movements</th>
                <th scope="col">When</th>
                {writable && canSource ? <th scope="col">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ connection, health, lastRun }) => (
                <tr key={connection.id}>
                  <td>{entityName(connection.entityId, entities)}</td>
                  <td>
                    <span className="block">{connection.name}</span>
                    <span className="mt-1 block text-xs text-ink-soft">
                      {venueLabel(connection.venue)} · {syncRunStatusLabel(lastRun?.status ?? "running")}
                    </span>
                  </td>
                  <td>
                    <span className={LEVEL_CLASS[health.level]}>{health.label}</span>
                    {connection.lastError ? <span className="mt-1 block text-xs text-seal">{connection.lastError}</span> : null}
                  </td>
                  <td>
                    {lastRun ? (
                      <span className="block">
                        {syncRunTriggerLabel(lastRun.trigger)} · {syncRunStatusLabel(lastRun.status)}
                      </span>
                    ) : (
                      <span className="text-ink-soft">Never</span>
                    )}
                    {lastRun?.error ? <span className="mt-1 block text-xs text-seal">{lastRun.error}</span> : null}
                  </td>
                  <td className="num">{lastRun?.balancesRead ?? "—"}</td>
                  <td className="num">{lastRun?.movementsRead ?? "—"}</td>
                  <td>{lastRun ? lastRun.startedAt.toISOString().slice(0, 16).replace("T", " ") : "—"}</td>
                  {writable && canSource ? (
                    <td>
                      <ConnectionControls
                        connectionId={connection.id}
                        csrf={csrf}
                        revoked={connection.status === "revoked"}
                        next="/dashboard/operations"
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!writable ? <div className="mt-4"><ReadOnlyNote /></div> : null}
      {!canSource ? (
        <RoleNote>You can view connector health. A manual re-run is for an owner or an admin.</RoleNote>
      ) : null}
    </>
  );
}
