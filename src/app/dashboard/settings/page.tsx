import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { can, roleLabel } from "@/auth/roles";
import { ConnectorForm } from "@/components/connector-form";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { ConnectionControls, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
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

      <section className="panel p-4">
        <h2 className="text-lg font-semibold tracking-tight">Account</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-ink-soft">Name</dt>
            <dd className="mt-1">{session.name}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Email</dt>
            <dd className="mt-1">{session.email}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Role</dt>
            <dd className="mt-1">{roleLabel(session.role)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Organization</dt>
            <dd className="mt-1">{books.organization.name}</dd>
          </div>
        </dl>
      </section>

      <section id="connections" className="mt-10 scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Connections</h2>
          {canSource ? (
            <Link href="/dashboard/setup" className="text-sm underline">
              Open the connection steps
            </Link>
          ) : null}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Add a wallet, an exchange, or a custodian here. One connection can cover several accounts. Scopes stay at
          balances and movements. No API key is stored.
        </p>
        {!writable && canSource ? <div className="mt-4"><ReadOnlyNote demo={session.demo} /></div> : null}
        {!canSource ? (
          <div className="mt-4">
            <RoleNote>You can view connections. Adding, checking, or disconnecting one is for an owner or an admin.</RoleNote>
          </div>
        ) : null}
        {books.connections.length === 0 ? (
          <p className="mt-4 panel px-4 py-6 text-sm text-ink-soft">No connections yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto panel">
            <table className="ledger-table">
              <caption className="sr-only">Read-only connections</caption>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Connection</th>
                  <th scope="col">Access</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last checked</th>
                  {canSource && writable ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {books.connections.map((connection) => {
                  const accounts = books.sources.filter((source) => source.connectionId === connection.id);
                  return (
                    <tr key={connection.id}>
                      <td>{entityName(connection.entityId, books.entities)}</td>
                      <td>
                        <span className="block">{connection.name}</span>
                        <span className="mt-1 block text-xs text-ink-soft">
                          {accounts.length === 0 ? "No account yet" : accounts.map((source) => source.name).join(", ")}
                        </span>
                      </td>
                      <td>
                        <span className="block">{connectionModeLabel(connection.mode)}</span>
                        <span className="mt-1 block text-xs text-ink-soft">
                          {venueLabel(connection.venue)} · {scopeLabel(connection.scopes)}
                        </span>
                      </td>
                      <td>
                        <span className={connection.status === "healthy" ? "text-pine" : connection.status === "degraded" ? "text-seal" : "text-ink-soft"}>
                          {connectionStatusLabel(connection.status)}
                        </span>
                        {connection.lastError ? <span className="mt-1 block text-xs text-seal">{connection.lastError}</span> : null}
                      </td>
                      <td>{connection.lastSyncedAt ? connection.lastSyncedAt.slice(0, 10) : "Not yet"}</td>
                      {canSource && writable ? (
                        <td>
                          <ConnectionControls connectionId={connection.id} csrf={csrf} revoked={connection.status === "revoked"} />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
            intro="A public address on Ethereum, Solana, or Polygon. Choose hot, cold, or staking. No key is stored."
          />
          <ConnectorForm
            id="exchange"
            books={books}
            csrf={csrf}
            mode="exchange_read"
            next="/dashboard/settings"
            title="Exchange, read-only"
            intro="An account id. This form does not ask for an API key, and the connection cannot trade or withdraw."
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
        <p className="mt-8 text-sm text-ink-soft">Add a company before connecting a wallet, exchange, or custodian.</p>
      ) : null}
    </>
  );
}
