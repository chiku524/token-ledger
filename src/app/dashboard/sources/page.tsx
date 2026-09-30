import { listStubAdapters } from "@/adapters";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { ConnectionControls, ConnectionForm, CsvImportForm, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { chainPanels, sourceCarryingPanels, sourceKindPanels } from "@/data/charts";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import {
  connectionModeLabel,
  connectionStatusLabel,
  entityName,
  formatQuantity,
  placeTypeLabel,
  scopeLabel,
  sourceName,
  venueLabel,
  walletRoleLabel,
} from "@/data/present";

export const metadata = { title: "Holdings" };

const connectionKind: Record<string, string> = {
  chain: "Wallet",
  exchange: "Exchange",
  custodian: "Custodian",
  accounting: "Accounting export",
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const writable = booksAreWritable() && !session.demo;
  const canSource = can(session.role, "source.write");
  const canImport = can(session.role, "source.import");
  const csrf = canSource || canImport ? await ensureCsrf() : "";
  const connectors = listStubAdapters();
  const panels = [...sourceCarryingPanels(books), ...sourceKindPanels(books), ...chainPanels(books)];

  return (
    <>
      <PageHeader
        kicker="Wallets, exchanges, and custodians"
        title="Holdings"
        description="Each wallet, exchange, and custodian is a read-only connection. Observed balances are what was read. Booked value is what the journal says."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      <h2 className="font-serif text-2xl">Connections</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        One connection can cover several addresses, accounts, or vaults. Scopes stay at balances and movements. No API key
        is stored. A check asks the connector and, until that connector is live, sends nothing.
      </p>
      {books.connections.length === 0 ? (
        <p className="mt-4 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No connections yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-line bg-paper-raised">
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

      <h2 className="mt-10 font-serif text-2xl">Observed balances</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        These quantities were observed on the connection. They are not a market price and not the booked value. Activity
        that has not been journaled still appears here.
      </p>
      {books.balanceSnapshots.length === 0 ? (
        <p className="mt-4 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No balances observed yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Observed balances</caption>
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Held at</th>
                <th scope="col">Asset</th>
                <th scope="col" className="num">Quantity</th>
                <th scope="col">As of</th>
              </tr>
            </thead>
            <tbody>
              {books.balanceSnapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{entityName(snapshot.entityId, books.entities)}</td>
                  <td>{sourceName(snapshot.sourceId, books.sources)}</td>
                  <td>{snapshot.assetCode}</td>
                  <td className="num">{formatQuantity(snapshot.quantityMinor, snapshot.assetCode, books.assets)}</td>
                  <td>{snapshot.asOf.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 font-serif text-2xl">Booked value</h2>
      {panels.length === 0 ? (
        <p className="mt-4 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No booked value to chart yet.</p>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {panels.map((panel) => (
            <ChartFrame
              key={panel.title}
              title={panel.title}
              description="Booked value. A wallet, exchange, or custodian with nothing booked is left out."
              rows={panel.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
            >
              <MoneyBars rows={panel.rows} currency={panel.currency} />
            </ChartFrame>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-4 xl:grid-cols-2">
        {!writable && (canSource || canImport) ? (
          <div className="xl:col-span-2">
            <ReadOnlyNote demo={session.demo} />
          </div>
        ) : null}
        {canSource || canImport ? null : (
          <div className="xl:col-span-2">
            <RoleNote>You can view holdings. Adding a connection, or importing activity, is not available for this role.</RoleNote>
          </div>
        )}
        {canSource ? <ConnectionForm books={books} csrf={csrf} /> : null}
        {canImport ? <CsvImportForm books={books} csrf={csrf} /> : null}
      </div>

      <h2 className="mt-10 font-serif text-2xl">Accounts</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Each row is one address, exchange account, or vault under a connection.
      </p>
      {books.sources.length === 0 ? (
        <p className="mt-8 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No wallets, exchanges, or custodians yet.</p>
      ) : (
        <div className="mt-8 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Wallets, exchanges, and custodians</caption>
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Connection</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Wallet type</th>
                <th scope="col">Network</th>
                <th scope="col">Address or account ID</th>
              </tr>
            </thead>
            <tbody>
              {books.sources.map((source) => (
                <tr key={source.id}>
                  <td>{entityName(source.entityId, books.entities)}</td>
                  <td>{source.connectionId ? (books.connections.find((connection) => connection.id === source.connectionId)?.name ?? "—") : "—"}</td>
                  <td>{source.name}</td>
                  <td>{placeTypeLabel(source.kind)}</td>
                  <td>{walletRoleLabel(source.role)}</td>
                  <td>{source.chain ?? "—"}</td>
                  <td className="num text-left">{source.identifier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 font-serif text-2xl">Connectors</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        These readers are not live. A check records that and does not send a request or store a key. Until one is live,
        import a CSV of activity for that wallet, exchange, or custodian.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {connectors.map((connector) => (
          <li key={connector.name} className="border border-line bg-paper-raised p-4">
            <p className="text-xs tracking-[0.14em] text-seal uppercase">
              Not connected · {connectionKind[connector.category] ?? connector.category}
            </p>
            <h3 className="mt-2 font-medium">{connector.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{connector.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
