import { listLiveAdapters, listStubAdapters } from "@/adapters";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { connectionStatusTone, StatusBadge } from "@/components/app/status-badge";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  ownershipLabel,
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
        <SectionHeader
          title="Connections"
          description={
            <>
              One connection can cover several addresses, accounts, or vaults. Connections stay read-only — scopes are
              balances and movements. Add, check, and disconnect a connection in{" "}
              <Link href="/dashboard/settings" className="underline">
                Settings
              </Link>
              .
            </>
          }
        />
        {books.connections.length === 0 ? (
          <EmptyState className="mt-4">No connections yet.</EmptyState>
        ) : (
          <TableCard>
            <Table>
              <caption className="sr-only">Read-only connections</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Company</TableHead>
                  <TableHead scope="col">Connection</TableHead>
                  <TableHead scope="col">Access</TableHead>
                  <TableHead scope="col">Ownership</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Last checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.connections.map((connection) => {
                  const accounts = books.sources.filter((source) => source.connectionId === connection.id);
                  return (
                    <TableRow key={connection.id}>
                      <TableCell className="min-w-36">{entityName(connection.entityId, books.entities)}</TableCell>
                      <TableCell className="min-w-44">
                        <span className="block">{connection.name}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {accounts.length === 0 ? "No account yet" : accounts.map((source) => source.name).join(", ")}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <span className="block">{connectionModeLabel(connection.mode)}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {venueLabel(connection.venue)} · {scopeLabel(connection.scopes)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={connection.ownership === "verified" ? "success" : "neutral"}>
                          {ownershipLabel(connection.ownership)}
                        </StatusBadge>
                        {connection.verifiedAddress ? (
                          <span className="mt-1 block font-mono text-xs text-muted-foreground">{connection.verifiedAddress}</span>
                        ) : (
                          <span className="mt-1 block text-xs text-muted-foreground">Not signed</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-56">
                        <StatusBadge tone={connectionStatusTone(connection.status)}>
                          {connectionStatusLabel(connection.status)}
                        </StatusBadge>
                        {connection.lastError ? <span className="mt-1 block text-xs text-danger">{connection.lastError}</span> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{connection.lastSyncedAt ? connection.lastSyncedAt.slice(0, 10) : "Not yet"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section id="observed-balances" className="scroll-mt-6">
        <SectionHeader
          className="mt-10"
          title="Observed balances"
          description="These quantities were observed on the connection. They are not a market price and not the booked value. Activity that has not been journaled still appears here."
        />
        {books.balanceSnapshots.length === 0 ? (
          <EmptyState className="mt-4">No balances observed yet.</EmptyState>
        ) : (
          <TableCard>
            <Table>
              <caption className="sr-only">Observed balances</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Company</TableHead>
                  <TableHead scope="col">Held at</TableHead>
                  <TableHead scope="col">Asset</TableHead>
                  <NumberHead scope="col">Quantity</NumberHead>
                  <TableHead scope="col">As of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...books.balanceSnapshots]
                  .sort((a, b) => b.asOf.localeCompare(a.asOf) || b.id.localeCompare(a.id))
                  .map((snapshot) => (
                    <TableRow key={snapshot.id}>
                      <TableCell>{entityName(snapshot.entityId, books.entities)}</TableCell>
                      <TableCell>{sourceName(snapshot.sourceId, books.sources)}</TableCell>
                      <TableCell>{snapshot.assetCode}</TableCell>
                      <NumberCell>{formatQuantity(snapshot.quantityMinor, snapshot.assetCode, books.assets)}</NumberCell>
                      <NumberCell align="left">{formatTimestamp(snapshot.asOf)}</NumberCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section id="market-value" className="scroll-mt-6">
        <SectionHeader
          className="mt-10"
          title="Market value"
          description={`Observed holdings valued at the latest saved price in ${valuation.quoteCurrency}. A price never posts to the journal. A stale or missing price is shown, not hidden.`}
        />
        {canSource && writable ? (
          <div className="mt-4">
            <MarketDataControls csrf={csrf} next="/dashboard/sources" />
          </div>
        ) : null}
        {valuation.stale ? (
          <Alert variant="warning" className="mt-3 max-w-2xl">
            At least one price is older than a day. Treat this total as provisional.
          </Alert>
        ) : null}
        {valuation.rows.length === 0 && valuation.unpriced.length === 0 ? (
          <EmptyState className="mt-4">No observed holdings to value yet.</EmptyState>
        ) : (
          <TableCard>
            <Table>
              <caption className="sr-only">Holdings valued at market price</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Asset</TableHead>
                  <NumberHead scope="col">Quantity held</NumberHead>
                  <NumberHead scope="col">Value · {valuation.quoteCurrency}</NumberHead>
                  <TableHead scope="col">Source</TableHead>
                  <TableHead scope="col">Freshness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuation.rows.map((row) => (
                  <TableRow key={row.assetCode}>
                    <TableCell>{row.assetCode}</TableCell>
                    <NumberCell>{formatQuantity(row.quantityMinor, row.assetCode, books.assets)}</NumberCell>
                    <NumberCell>{formatMoney(row.valueMinor, row.quoteCurrency)}</NumberCell>
                    <TableCell>
                      <span className="capitalize">{originLabel(row.origin)}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{row.source}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={row.age === "stale" ? "danger" : "success"}>{freshnessLabel(row.age)}</StatusBadge>
                      <span className="mt-1 block text-xs text-muted-foreground">{ageLabel(row.asOf, valuation.asOf)}</span>
                    </TableCell>
                  </TableRow>
                ))}
                {valuation.unpriced.map((row) => (
                  <TableRow key={`unpriced_${row.assetCode}`}>
                    <TableCell>{row.assetCode}</TableCell>
                    <NumberCell>{formatQuantity(row.quantityMinor, row.assetCode, books.assets)}</NumberCell>
                    <NumberCell className="text-muted-foreground">No price</NumberCell>
                    <TableCell>—</TableCell>
                    <TableCell>
                      <StatusBadge tone="danger">{freshnessLabel("missing")}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {valuation.rows.length > 0 ? (
                <TableFooter>
                  <TableRow>
                    <TableHead scope="row">Total</TableHead>
                    <TableCell />
                    <NumberCell>{formatMoney(valuation.totalMinor, valuation.quoteCurrency)}</NumberCell>
                    <TableCell colSpan={2}>
                      {valuation.incomplete ? "Partial: some holdings are unpriced or stale." : "All holdings priced."}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </TableCard>
        )}
      </section>

      <SectionHeader className="mt-10" title="Booked value" />
      {panels.length === 0 ? (
        <EmptyState className="mt-4">No booked value to chart yet.</EmptyState>
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

      <SectionHeader
        className="mt-10"
        title="Accounts"
        description="Each row is one address, exchange account, or vault under a connection."
      />
      {books.sources.length === 0 ? (
        <EmptyState className="mt-8">No wallets, exchanges, or custodians yet.</EmptyState>
      ) : (
        <TableCard className="mt-8">
          <Table>
            <caption className="sr-only">Wallets, exchanges, and custodians</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Company</TableHead>
                <TableHead scope="col">Connection</TableHead>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">Wallet type</TableHead>
                <TableHead scope="col">Network</TableHead>
                <TableHead scope="col">Address or account ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>{entityName(source.entityId, books.entities)}</TableCell>
                  <TableCell>
                    {source.connectionId ? (books.connections.find((connection) => connection.id === source.connectionId)?.name ?? "—") : "—"}
                  </TableCell>
                  <TableCell>{source.name}</TableCell>
                  <TableCell>{placeTypeLabel(source.kind)}</TableCell>
                  <TableCell>{walletRoleLabel(source.role)}</TableCell>
                  <TableCell>{source.chain ?? "—"}</TableCell>
                  <NumberCell align="left" className="whitespace-normal break-all">
                    {source.identifier}
                  </NumberCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <SectionHeader
        className="mt-10"
        title="Connectors"
        description="Wallet, exchange, and custodian readers are live and read-only; checking one records the observation and does not post a journal. A live reader sends a read-only request and stores no key. Import a CSV of activity for a source that has no live reader."
      />
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {liveConnectors.map((connector) => (
          <li key={connector.name}>
            <Card className="h-full border-success/40">
              <CardContent>
                <p className="text-xs tracking-[0.14em] text-success uppercase">
                  Live · {connectionKind[connector.category] ?? connector.category}
                </p>
                <h3 className="mt-2 font-medium">{connector.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{connector.summary}</p>
              </CardContent>
            </Card>
          </li>
        ))}
        {connectors.map((connector) => (
          <li key={connector.name}>
            <Card className="h-full">
              <CardContent>
                <p className="text-xs tracking-[0.14em] text-danger uppercase">
                  Not connected · {connectionKind[connector.category] ?? connector.category}
                </p>
                <h3 className="mt-2 font-medium">{connector.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{connector.summary}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
