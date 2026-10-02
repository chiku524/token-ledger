import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { can, roleLabel } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { connectionStatusTone, StatusBadge } from "@/components/app/status-badge";
import { TableCard } from "@/components/app/table-card";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConnectorForm } from "@/components/connector-form";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { ConnectionControls, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { WATCH_CHAIN_LABELS } from "@/data/connections";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { connectionModeLabel, connectionStatusLabel, entityName, scopeLabel, venueLabel } from "@/data/present";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const writable = booksAreWritable() && !session.demo;
  const canSource = can(session.role, "source.write");
  const csrf = await ensureCsrf();

  return (
    <>
      <PageHeader
        kicker="Account"
        title="Settings"
        description="Your account, and the read-only connections for this organization. A connection cannot withdraw, trade, or sign."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />

      <Card>
        <CardContent className="grid gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Account</h2>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="mt-1">{session.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-1">{session.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="mt-1">{roleLabel(session.role)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="mt-1">{books.organization.name}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section id="connections" className="mt-10 scroll-mt-6">
        <SectionHeader
          title="Connections"
          description="Add a wallet, an exchange, or a custodian here. One connection can cover several accounts. Scopes stay at balances and movements. No API key is stored."
          action={
            canSource ? (
              <Link href="/dashboard/setup" className="text-sm text-link underline">
                Open the connection steps
              </Link>
            ) : undefined
          }
        />
        {!writable && canSource ? <div className="mt-4"><ReadOnlyNote demo={session.demo} /></div> : null}
        {!canSource ? (
          <div className="mt-4">
            <RoleNote>You can view connections. Adding, checking, or disconnecting one is for an owner or an admin.</RoleNote>
          </div>
        ) : null}
        {books.connections.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Link2}
            action={
              canSource ? (
                <Button asChild variant="secondary">
                  <Link href="/dashboard/setup">Open the connection steps</Link>
                </Button>
              ) : undefined
            }
          >
            No connections yet.
          </EmptyState>
        ) : (
          <TableCard>
            <Table>
              <caption className="sr-only">Read-only connections</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last checked</TableHead>
                  {canSource && writable ? <TableHead>Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.connections.map((connection) => {
                  const accounts = books.sources.filter((source) => source.connectionId === connection.id);
                  return (
                    <TableRow key={connection.id}>
                      <TableCell>{entityName(connection.entityId, books.entities)}</TableCell>
                      <TableCell>
                        <span className="block">{connection.name}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {accounts.length === 0 ? "No account yet" : accounts.map((source) => source.name).join(", ")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block">{connectionModeLabel(connection.mode)}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {venueLabel(connection.venue)} · {scopeLabel(connection.scopes)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={connectionStatusTone(connection.status)}>
                          {connectionStatusLabel(connection.status)}
                        </StatusBadge>
                        {connection.lastError ? <span className="mt-1 block text-xs text-danger">{connection.lastError}</span> : null}
                      </TableCell>
                      <TableCell>{connection.lastSyncedAt ? connection.lastSyncedAt.slice(0, 10) : "Not yet"}</TableCell>
                      {canSource && writable ? (
                        <TableCell>
                          <ConnectionControls connectionId={connection.id} csrf={csrf} revoked={connection.status === "revoked"} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      {canSource && books.entities.length > 0 ? (
        <div className="mt-8 grid gap-4">
          <ConnectorForm
            id="wallet"
            books={books}
            csrf={csrf}
            mode="watch"
            next="/dashboard/settings"
            title="Watch-only wallet"
            intro={`A public address on ${WATCH_CHAIN_LABELS}. Choose hot, cold, or staking. No key is stored.`}
          />
          <ConnectorForm
            id="exchange"
            books={books}
            csrf={csrf}
            mode="exchange_read"
            next="/dashboard/settings"
            title="Exchange, read-only"
            intro="An account label and a read-only API key. The key is checked with a real read-only call, then sealed. The connection cannot trade or withdraw."
          />
          <ConnectorForm
            id="custodian"
            books={books}
            csrf={csrf}
            mode="custodian_read"
            next="/dashboard/settings"
            title="Custodian, read-only"
            intro="A vault id, and a network when the vault has one. A viewer credential is not collected."
          />
        </div>
      ) : null}
      {canSource && books.entities.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Add a company before connecting a wallet, exchange, or custodian.</p>
      ) : null}
    </>
  );
}
