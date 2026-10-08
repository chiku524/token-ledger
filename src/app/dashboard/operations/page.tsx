import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge, type StatusTone } from "@/components/app/status-badge";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Stagger } from "@/components/motion/stagger";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ConnectionControls, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadOperations } from "@/data/load-operations";
import { actionLabel, entityName, syncRunStatusLabel, syncRunTriggerLabel, venueLabel } from "@/data/present";
import { one } from "@/data/query";
import { requireSectionAccess } from "@/data/section-access";

export const metadata = { title: "Operations" };

const LEVEL_TONE: Record<string, StatusTone> = {
  attention: "danger",
  waiting: "neutral",
  ok: "success",
  disconnected: "neutral",
};

function executionTone(finalizedAt: Date | null, error: string | null, signature: string | null): StatusTone {
  if (finalizedAt) return "success";
  if (error) return "danger";
  return signature ? "warning" : "neutral";
}

function executionLabel(finalizedAt: Date | null, error: string | null, signature: string | null): string {
  if (finalizedAt) return "Finalized";
  if (error) return "Failed";
  return signature ? "Awaiting finality" : "Queued";
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  await requireSectionAccess("/dashboard/operations");
  const { session, writable, entities, queuedEvents, rows, chain } = await loadOperations();
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

      {chain ? (
        <section className="mt-8">
          <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Execution in flight" value={chain.execution.awaitingFinality + chain.execution.awaitingSubmission} tone={chain.execution.failed > 0 ? "danger" : undefined} hint={`${chain.execution.finalized} finalized`} />
            <StatCard label="Failed runs" value={chain.execution.failed} tone={chain.execution.failed > 0 ? "danger" : "success"} hint="Execution attempts that errored" />
            <StatCard label="Job queue pending" value={chain.outbox.pending + chain.outbox.failed} tone={chain.outbox.failed > 0 ? "danger" : undefined} hint={`${chain.outbox.leased} leased, ${chain.outbox.completed} done`} />
            <StatCard label="Indexer lag" value={chain.indexer.stale ? "Stale" : "Fresh"} tone={chain.indexer.stale ? "danger" : "success"} hint={chain.indexer.worstLagSeconds === null ? "No cursors" : `Worst ${chain.indexer.worstLagSeconds}s`} />
          </Stagger>

          {chain.execution.rows.length > 0 ? (
            <div className="mt-6">
              <SectionHeader
                title="Recent executions"
                description="Billing collections and treasury payments. Only a finalized slot is settled; 'submitted' is not."
              />
              <TableCard>
                <Table>
                  <caption className="sr-only">Recent chain executions</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kind</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Signature</TableHead>
                      <TableHead>Attempt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chain.execution.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{actionLabel(row.kind)}</TableCell>
                        <TableCell>
                          <StatusBadge tone={executionTone(row.finalizedAt, row.error, row.signature)}>
                            {executionLabel(row.finalizedAt, row.error, row.signature)}
                          </StatusBadge>
                          {row.error ? <span className="mt-1 block text-xs text-danger">{row.error}</span> : null}
                        </TableCell>
                        <NumberCell align="left" className="break-all">
                          {row.signature ?? "—"}
                        </NumberCell>
                        <NumberCell align="left">{row.attempt}</NumberCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          ) : null}

          {chain.indexer.rows.length > 0 ? (
            <div className="mt-6">
              <SectionHeader title="Indexer cursors" description="How far the chain indexer has read each program. A stale cursor means finalized state is not yet reflected." />
              <TableCard>
                <Table>
                  <caption className="sr-only">Indexer cursors</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cluster</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Cursor</TableHead>
                      <TableHead>Lag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chain.indexer.rows.map((cursor) => (
                      <TableRow key={`${cursor.cluster}-${cursor.programId}`}>
                        <TableCell>{cursor.cluster}</TableCell>
                        <NumberCell align="left" className="break-all">
                          {cursor.programId}
                        </NumberCell>
                        <NumberCell align="left">{cursor.cursor}</NumberCell>
                        <NumberCell align="left">{cursor.lagSeconds}s</NumberCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          ) : null}
        </section>
      ) : null}

      <Card className={chain ? "mt-8" : undefined}>
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
                  <TableCell className="min-w-32">{entityName(connection.entityId, entities)}</TableCell>
                  <TableCell className="min-w-44">
                    <span className="block">{connection.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {venueLabel(connection.venue)}
                      {lastRun ? ` · ${syncRunStatusLabel(lastRun.status)}` : " · Never run"}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-44">
                    <StatusBadge tone={LEVEL_TONE[health.level] ?? "neutral"}>{health.label}</StatusBadge>
                    {connection.lastError ? <span className="mt-1 block text-xs text-danger">{connection.lastError}</span> : null}
                  </TableCell>
                  <TableCell className="min-w-36">
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
