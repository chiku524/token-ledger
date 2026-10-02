import { listLiveAdapters, listStubAdapters } from "@/adapters";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { CsvImportForm, MarketDataControls, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { chainPanels, sourceCarryingPanels, sourceKindPanels } from "@/data/charts";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { valueBooksHoldings } from "@/data/valuation";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import {
  ageLabel,
  connectionModeLabel,
  connectionStatusLabel,
  entityName,
  formatMoney,
  formatQuantity,
  formatTimestamp,
  freshnessLabel,
  originLabel,
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
  const valuation = valueBooksHoldings({
    snapshots: books.balanceSnapshots,
    prices: books.assetPrices,
    assets: books.assets,
    quoteCurrency: "USD",
    asOf: new Date().toISOString(),
  });
  const connectors = listStubAdapters();
  const liveConnectors = listLiveAdapters();
  const panels = [...sourceCarryingPanels(books), ...sourceKindPanels(books), ...chainPanels(books)];

  return (
    <>
      <PageHeader
        kicker="Wallets, exchanges, and custodians"
        title="Holdings"
        description="Each wallet, exchange, and custodian is a read-only connection. Observed balances are what was read. Booked value is what the journal says."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      <section id="connections" className="scroll-mt-6">
      <h2 className="text-lg font-semibold tracking-tight">Connections</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        One connection can cover several addresses, accounts, or vaults. Scopes stay at balances and movements. No API key
        is stored. Add, check, and disconnect a connection in{" "}
        <Link href="/dashboard/settings" className="underline">
          Settings
        </Link>
        .
      </p>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </section>

      <section id="observed-balances" className="scroll-mt-6">
      <h2 className="mt-10 text-lg font-semibold tracking-tight">Observed balances</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        These quantities were observed on the connection. They are not a market price and not the booked value. Activity
        that has not been journaled still appears here.
      </p>
      {books.balanceSnapshots.length === 0 ? (
        <p className="mt-4 panel px-4 py-6 text-sm text-ink-soft">No balances observed yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto panel">
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
              {[...books.balanceSnapshots]
                .sort((a, b) => b.asOf.localeCompare(a.asOf) || b.id.localeCompare(a.id))
                .map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{entityName(snapshot.entityId, books.entities)}</td>
                  <td>{sourceName(snapshot.sourceId, books.sources)}</td>
                  <td>{snapshot.assetCode}</td>
                  <td className="num">{formatQuantity(snapshot.quantityMinor, snapshot.assetCode, books.assets)}</td>
                  <td className="num text-left">{formatTimestamp(snapshot.asOf)}</td>
                </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      </section>

      <section id="market-value" className="scroll-mt-6">
        <h2 className="mt-10 text-lg font-semibold tracking-tight">Market value</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Observed holdings valued at the latest saved price in {valuation.quoteCurrency}. A price never posts to the
          journal. A stale or missing price is shown, not hidden.
        </p>
        {canSource && writable ? (
          <div className="mt-4">
            <MarketDataControls csrf={csrf} next="/dashboard/sources" />
          </div>
        ) : null}
        {valuation.stale ? (
          <p role="alert" className="mt-3 max-w-2xl rounded-xl border border-seal/30 bg-paper-raised px-4 py-3 text-sm text-seal">
            At least one price is older than a day. Treat this total as provisional.
          </p>
        ) : null}
        {valuation.rows.length === 0 && valuation.unpriced.length === 0 ? (
          <p className="mt-4 panel px-4 py-6 text-sm text-ink-soft">No observed holdings to value yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto panel">
            <table className="ledger-table">
              <caption className="sr-only">Holdings valued at market price</caption>
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col" className="num">Quantity held</th>
                  <th scope="col" className="num">Value · {valuation.quoteCurrency}</th>
                  <th scope="col">Source</th>
                  <th scope="col">Freshness</th>
                </tr>
              </thead>
              <tbody>
                {valuation.rows.map((row) => (
                  <tr key={row.assetCode}>
                    <td>{row.assetCode}</td>
                    <td className="num">{formatQuantity(row.quantityMinor, row.assetCode, books.assets)}</td>
                    <td className="num">{formatMoney(row.valueMinor, row.quoteCurrency)}</td>
                    <td>
                      <span className="capitalize">{originLabel(row.origin)}</span>
                      <span className="mt-1 block text-xs text-ink-soft">{row.source}</span>
                    </td>
                    <td>
                      <span className={row.age === "stale" ? "text-seal" : "text-pine"}>{freshnessLabel(row.age)}</span>
                      <span className="mt-1 block text-xs text-ink-soft">{ageLabel(row.asOf, valuation.asOf)}</span>
                    </td>
                  </tr>
                ))}
                {valuation.unpriced.map((row) => (
                  <tr key={`unpriced_${row.assetCode}`}>
                    <td>{row.assetCode}</td>
                    <td className="num">{formatQuantity(row.quantityMinor, row.assetCode, books.assets)}</td>
                    <td className="num text-ink-soft">No price</td>
                    <td>—</td>
                    <td>
                      <span className="text-seal">{freshnessLabel("missing")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {valuation.rows.length > 0 ? (
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td />
                    <td className="num">{formatMoney(valuation.totalMinor, valuation.quoteCurrency)}</td>
                    <td colSpan={2}>{valuation.incomplete ? "Partial: some holdings are unpriced or stale." : "All holdings priced."}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </section>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Booked value</h2>
      {panels.length === 0 ? (
        <p className="mt-4 panel px-4 py-6 text-sm text-ink-soft">No booked value to chart yet.</p>
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
            <RoleNote>You can view holdings. Connecting a wallet, exchange, or custodian is done in Settings, and importing activity is not available for this role.</RoleNote>
          </div>
        )}
        {canImport ? <CsvImportForm books={books} csrf={csrf} /> : null}
      </div>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Accounts</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Each row is one address, exchange account, or vault under a connection.
      </p>
      {books.sources.length === 0 ? (
        <p className="mt-8 panel px-4 py-6 text-sm text-ink-soft">No wallets, exchanges, or custodians yet.</p>
      ) : (
        <div className="mt-8 overflow-x-auto panel">
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

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Connectors</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Wallet, exchange, and custodian readers are live and read-only; checking one records the observation and does not
        post a journal. A live reader sends a read-only request and stores no key. Import a CSV of activity for a source
        that has no live reader.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {liveConnectors.map((connector) => (
          <li key={connector.name} className="panel border-pine/40 p-4">
            <p className="text-xs tracking-[0.14em] text-pine uppercase">
              Live · {connectionKind[connector.category] ?? connector.category}
            </p>
            <h3 className="mt-2 font-medium">{connector.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{connector.summary}</p>
          </li>
        ))}
        {connectors.map((connector) => (
          <li key={connector.name} className="panel p-4">
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
