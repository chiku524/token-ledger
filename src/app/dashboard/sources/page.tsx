import { listLiveAdapters, listStubAdapters } from "@/adapters";
import { MoneyBars } from "@/components/charts/lazy";
import { ChartFrame } from "@/components/charts/frame";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { ConnectionsTable } from "@/components/app/connections-table";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatusBadge } from "@/components/app/status-badge";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { Link2, Wallet } from "lucide-react";
import { CsvImportForm, MarketDataControls, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { chainPanels, sourceCarryingPanels, sourceKindPanels } from "@/data/charts";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { latestSnapshots, valueBooksHoldings } from "@/data/valuation";
import type { Books, BooksBalanceSnapshot } from "@/data/books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { requireSectionAccess } from "@/data/section-access";
import {
  ageLabel,
  entityName,
  formatMoney,
  formatQuantity,
  formatTimestamp,
  freshnessLabel,
  originLabel,
  placeTypeLabel,
  sourceName,
  walletRoleLabel,
} from "@/data/present";

export const metadata = { title: "Holdings" };

const connectionKind: Record<string, string> = {
  chain: "Wallet",
  exchange: "Exchange",
  custodian: "Custodian",
  accounting: "Accounting export",
};

function sortSnapshots(snapshots: readonly BooksBalanceSnapshot[]) {
  return [...snapshots].sort((a, b) => b.asOf.localeCompare(a.asOf) || b.id.localeCompare(a.id));
}

function SnapshotTable({
  caption,
  snapshots,
  books,
}: {
  caption: string;
  snapshots: readonly BooksBalanceSnapshot[];
  books: Books;
}) {
  return (
    <TableCard>
      <Table>
        <caption className="sr-only">{caption}</caption>
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
          {snapshots.map((snapshot) => (
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
  );
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  await requireSectionAccess("/dashboard/sources");
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
  const latest = sortSnapshots(latestSnapshots(books.balanceSnapshots));
  const history = books.balanceSnapshots.length > latest.length ? sortSnapshots(books.balanceSnapshots) : [];
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
            No connections yet. Connect a venue first, then Check it so balances can appear below.
          </EmptyState>
        ) : (
          <ConnectionsTable books={books} />
        )}
      </section>

      <section id="observed-balances" className="scroll-mt-6">
        <SectionHeader
          className="mt-10"
          title="Observed balances"
          description="The latest quantity observed per wallet, exchange, or custodian and asset. Not a market price and not the booked value. Activity that has not been journaled still appears here."
        />
        {books.balanceSnapshots.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Wallet}
            action={
              canSource && books.connections.length > 0 ? (
                <Button asChild variant="secondary">
                  <Link href="/dashboard/settings#connections">Check a connection in Settings</Link>
                </Button>
              ) : canSource ? (
                <Button asChild variant="secondary">
                  <Link href="/dashboard/setup">Connect a venue</Link>
                </Button>
              ) : undefined
            }
          >
            {books.connections.length === 0
              ? "No balances observed yet. Connect a read-only venue, then press Check."
              : "No balances observed yet. Press Check on the connection in Settings — connecting alone does not pull coins."}
          </EmptyState>
        ) : (
          <>
            <SnapshotTable caption="Latest observed balances" snapshots={latest} books={books} />
            {history.length > 0 ? (
              <details className="group mt-3">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Balance history ({books.balanceSnapshots.length} observations)
                </summary>
                <SnapshotTable caption="All observed balances" snapshots={history} books={books} />
              </details>
            ) : null}
          </>
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
            <RoleNote>You can view holdings. Connect and sign your own wallet in Settings. Adding an exchange or custodian, and importing activity, are for an owner or an admin.</RoleNote>
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
        <EmptyState
          className="mt-8"
          icon={Link2}
          action={
            canSource ? (
              <Button asChild variant="secondary">
                <Link href="/dashboard/setup">Open the connection steps</Link>
              </Button>
            ) : undefined
          }
        >
          No wallets, exchanges, or custodians yet. Accounts appear here after you connect a venue.
        </EmptyState>
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
                <p className="label-caps text-success">
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
                <p className="label-caps text-danger">
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
