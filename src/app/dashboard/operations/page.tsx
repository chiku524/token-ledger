import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge, type StatusTone } from "@/components/app/status-badge";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ConnectionControls, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadOperations } from "@/data/load-operations";
import { entityName, syncRunStatusLabel, syncRunTriggerLabel, venueLabel } from "@/data/present";
import { one } from "@/data/query";

export const metadata = { title: "Operations" };

const LEVEL_TONE: Record<string, StatusTone> = {
  attention: "danger",
  waiting: "neutral",
  ok: "success",
  disconnected: "neutral",
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

      <Card>
        <CardContent className="grid gap-2">
          <h2 className="text-lg font-semibold tracking-tight">How scheduled sync works</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            A scheduler pulls every due connection on an interval and records each run here. A run that fails is retried with
            a growing backoff, and a connection that keeps failing is marked degraded. Every pull is read-only and never posts
            a journal. Each run keeps its counts; raw payloads are retained for the most recent runs and then age out.
          </p>
          <p className="text-sm text-muted-foreground">
            {queuedEvents === 0
              ? "No signed events are waiting to be matched."
              : `${queuedEvents} signed ${queuedEvents === 1 ? "event is" : "events are"} waiting to be matched.`}
          </p>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState className="mt-8">
          No connections yet. Add one in{" "}
          <Link href="/dashboard/settings" className="text-link underline">
            Settings
          </Link>
          .
        </EmptyState>
      ) : (
        <TableCard className="mt-8">
          <Table>
            <caption className="sr-only">Connector health</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Last run</TableHead>
                <NumberHead>Balances</NumberHead>
                <NumberHead>Movements</NumberHead>
                <TableHead>When</TableHead>
                {writable && canSource ? <TableHead>Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ connection, health, lastRun }) => (
                <TableRow key={connection.id}>
                  <TableCell>{entityName(connection.entityId, entities)}</TableCell>
                  <TableCell>
                    <span className="block">{connection.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {venueLabel(connection.venue)}
                      {lastRun ? ` · ${syncRunStatusLabel(lastRun.status)}` : " · Never run"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={LEVEL_TONE[health.level] ?? "neutral"}>{health.label}</StatusBadge>
                    {connection.lastError ? <span className="mt-1 block text-xs text-danger">{connection.lastError}</span> : null}
                  </TableCell>
                  <TableCell>
                    {lastRun ? (
                      <span className="block">
                        {syncRunTriggerLabel(lastRun.trigger)} · {syncRunStatusLabel(lastRun.status)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                    {lastRun?.error ? <span className="mt-1 block text-xs text-danger">{lastRun.error}</span> : null}
                  </TableCell>
                  <NumberCell>{lastRun?.balancesRead ?? "—"}</NumberCell>
                  <NumberCell>{lastRun?.movementsRead ?? "—"}</NumberCell>
                  <NumberCell align="left">{lastRun ? lastRun.startedAt.toISOString().slice(0, 16).replace("T", " ") : "—"}</NumberCell>
                  {writable && canSource ? (
                    <TableCell>
                      <ConnectionControls
                        connectionId={connection.id}
                        csrf={csrf}
                        revoked={connection.status === "revoked"}
                        next="/dashboard/operations"
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {!writable ? <div className="mt-4"><ReadOnlyNote demo={session.demo} /></div> : null}
      {!canSource ? (
        <RoleNote>You can view connector health. A manual re-run is for an owner or an admin.</RoleNote>
      ) : null}
    </>
  );
}
