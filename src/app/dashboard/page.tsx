import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { ActivityBars, MoneyBars, MoneyLine, StatusDonut } from "@/components/charts/lazy";
import { ChartFrame } from "@/components/charts/frame";
import { GainLossPanel } from "@/components/app/gain-loss-panel";
import { SectionHeader } from "@/components/app/section-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyRow, NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Stagger } from "@/components/motion/stagger";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  assetAllocationPanels,
  carryingSeries,
  compositionPanels,
  journalActivityChart,
  reconciliationStatus,
} from "@/data/charts";
import { one } from "@/data/query";
import { journalName, journalNameLower } from "@/data/account-sections";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { isHoldingsDisplayCurrency, resolveHoldingsDisplayCurrency } from "@/data/display-currency";
import { holdingsGainLoss } from "@/data/gain-loss";
import { holdingsRealizedGainLoss, realizedRangeQuery, resolveRealizedRange } from "@/data/realized-gain-loss";
import { booksAreWritable } from "@/data/load-books";
import { entityName, formatMoney } from "@/data/present";
import { financialStatements, trialBalance } from "@/ledger";
import { FinancialStatementsCards } from "@/components/app/financial-statements";
import { IndividualOverview } from "./individual-overview";

export const metadata = { title: "Overview" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ currency?: string | string[]; range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
} = {}) {
  const params = (await searchParams) ?? {};
  const { session, books } = await loadAuthorizedBooks();
  // An individual has no Matching, Companies or Combined, so the overview leaves them out.
  const individual = session.accountType === "individual";
  if (individual) return <IndividualOverview books={books} gainLossCurrency={one(params.currency)} />;
  // An individual's Journal is called Activity.
  const book = journalName(session.accountType);
  const bookLower = journalNameLower(session.accountType);
  const exceptions = individual ? [] : books.reconciliations.filter((record) => record.status === "exception");
  const balances = books.entities.map((entity) => ({
    entity,
    report: trialBalance(books.journalEntries, books.accounts, entity.id),
    statements: financialStatements(books.journalEntries, books.accounts, books.assets, entity.id),
  }));
  const inBalance = balances.every((item) => item.report.debitTotal === item.report.creditTotal);
  const recent = [...books.journalEntries].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 4);
  const allocation = assetAllocationPanels(books);
  const series = carryingSeries(books);
  const composition = compositionPanels(books);
  const activity = journalActivityChart(books);
  const status = reconciliationStatus(books);
  const functionalCurrency = books.entities[0]?.functionalCurrency ?? "";
  const gainLossCurrency = resolveHoldingsDisplayCurrency(one(params.currency), isHoldingsDisplayCurrency(functionalCurrency) ? functionalCurrency : undefined);
  const gainLoss = holdingsGainLoss(books, { individual: false, currency: gainLossCurrency });
  const resolvedRange = resolveRealizedRange({ range: one(params.range), from: one(params.from), to: one(params.to) });
  const realized = holdingsRealizedGainLoss(books, { currency: gainLossCurrency, range: resolvedRange.range });
  const rangeQuery = realizedRangeQuery(resolvedRange.range);
  const withRange = rangeQuery ? `&${rangeQuery}` : "";
  const currencyNote = individual
    ? "Each chart stays in your reporting currency."
    : booksAreWritable() && !session.demo && !session.demoBooks
    ? "Each chart stays in that company's currency. The Combined page converts them into one currency."
    : "Sample figures. Each chart stays in that company's currency. The Combined page converts them with sample rates, not a market price.";

  return (
    <>
      <PageHeader
        kicker={books.period.label}
        title={books.organization.name}
        description={
          books.organization.origin === "example"
            ? individual
              ? "Sample figures for a personal account."
              : "A sample group: a parent company in Malaysia and a company in Singapore."
            : "Saved books for this organization."
        }
      />

      <Stagger className={individual ? "grid grid-cols-2 gap-2 sm:gap-3" : "grid grid-cols-4 gap-2 sm:gap-3"}>
        {individual ? null : <StatCard label="Companies" value={books.entities.length} />}
        <StatCard label="Wallets and accounts" value={books.sources.length} />
        {individual ? null : <StatCard label="Unmatched" value={exceptions.length} tone={exceptions.length ? "danger" : "success"} />}
        <StatCard label="Books" value={inBalance ? "In balance" : "Out of balance"} tone={inBalance ? "success" : "danger"} />
      </Stagger>

      <nav aria-label="Day to day" className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/dashboard/sources#observed-balances" className="text-link underline">
          Holdings
        </Link>
        {individual ? null : (
          <Link href="/dashboard/reconciliation" className="text-link underline">
            Matching
          </Link>
        )}
        <Link href="/dashboard/ledger" className="text-link underline">
          {book}
        </Link>
        <Link href="/dashboard/reports" className="text-link underline">
          Reports
        </Link>
        <Link href="/dashboard/settings#connections" className="text-muted-foreground underline hover:text-foreground">
          Connections
        </Link>
      </nav>

      {exceptions[0] ? (
        <Alert variant="destructive" role="status" className="mt-8">
          <TriangleAlert aria-hidden />
          <AlertTitle>Unmatched activity</AlertTitle>
          <AlertDescription>
            {books.sourceTransactions.find((transaction) => transaction.id === exceptions[0]?.sourceTransactionId)?.description}{" "}
            <Link href={`/dashboard/reconciliation?from=${exceptions[0].periodStart}&to=${exceptions[0].periodEnd}`}>
              See what did not match
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <GainLossPanel
        gainLoss={gainLoss}
        realized={realized}
        id="gain-loss"
        className="mt-10 scroll-mt-6"
        currencyHref={(code) => `/dashboard?currency=${code}${withRange}#gain-loss`}
        realizedRange={{
          presetHref: (key) => `/dashboard?currency=${gainLossCurrency}${key === "all" ? "" : `&range=${key}`}#gain-loss`,
          formPath: "/dashboard#gain-loss",
          error: resolvedRange.error,
        }}
        action={
          <Link href={`/dashboard/sources?currency=${gainLossCurrency}${withRange}#gain-loss`} className="text-sm text-link underline">
            Open holdings
          </Link>
        }
      />

      <section className="mt-10">
        <SectionHeader
          title="Recent entries"
          action={
            <Link href="/dashboard/ledger" className="text-sm text-link underline">
              Open {bookLower}
            </Link>
          }
        />
        <TableCard>
          <Table>
            <caption className="sr-only">Recent {bookLower} entries</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Reference</TableHead>
                <TableHead scope="col">Company</TableHead>
                <TableHead scope="col">Memo</TableHead>
                <NumberHead scope="col">Amount</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 ? <EmptyRow colSpan={5}>No entries posted yet.</EmptyRow> : null}
              {recent.map((entry) => (
                <TableRow key={entry.id}>
                  <NumberCell align="left">{entry.entryDate}</NumberCell>
                  <TableCell className="whitespace-nowrap">
                    <Link href="/dashboard/ledger" className="underline">
                      {entry.reference}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-36">{entityName(entry.entityId, books.entities)}</TableCell>
                  <TableCell className="min-w-56">{entry.memo}</TableCell>
                  <NumberCell>{formatMoney(entry.debitMinor, entry.currency)}</NumberCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {(individual ? [] : balances).map(({ entity, report }) => (
          <Card key={entity.id}>
            <CardContent>
              <p className="label-caps">
                {entity.jurisdiction} · {entity.functionalCurrency}
              </p>
              <SectionHeader title={entity.name} className="mt-2" />
              <p className="mt-3 text-sm text-muted-foreground">
                {entity.reportingFramework}
                {entity.parentEntityId ? ` · part of ${entityName(entity.parentEntityId, books.entities)}` : " · parent company"}
              </p>
              <p className="mt-4 text-sm">
                Debits {report.currency ? formatMoney(report.debitTotal, report.currency) : "—"}
                <span className="text-muted-foreground"> = </span>
                credits {report.currency ? formatMoney(report.creditTotal, report.currency) : "—"}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <details className="group mt-10" open>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
          Charts and statements
        </summary>
        <div className="mt-6">
          <SectionHeader
            title="Balance Sheet and Profit & Loss"
            description={currencyNote}
            action={
              <Link href="/dashboard/reports" className="text-sm text-link underline">
                Open reports
              </Link>
            }
          />
          <div className="mt-4 grid gap-6">
            {balances.map(({ entity, statements }) => (
              <FinancialStatementsCards
                key={entity.id}
                statements={statements}
                company={`${entity.name} · ${entity.functionalCurrency}`}
              />
            ))}
          </div>

          <section className="mt-8 grid gap-4 xl:grid-cols-2">
            {allocation.map((panel) => (
              <ChartFrame
                key={panel.id}
                title={panel.title}
                description={currencyNote}
                rows={panel.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
              >
                <MoneyBars rows={panel.rows} currency={panel.currency} />
              </ChartFrame>
            ))}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            {series.map((panel) => (
              <ChartFrame
                key={panel.id}
                title={`Value · ${panel.title}`}
                description="Booked value of crypto after each entry."
                rows={panel.points.map((point) => ({ label: point.label, detail: point.formatted }))}
              >
                <MoneyLine panel={panel} />
              </ChartFrame>
            ))}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            {composition.map((panel) => (
              <ChartFrame
                key={panel.id}
                title={`Accounts · ${panel.title}`}
                description="Cash, crypto, and stablecoins on the books. Accounts with no activity are left out."
                rows={panel.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
              >
                <MoneyBars rows={panel.rows} currency={panel.currency} />
              </ChartFrame>
            ))}
          </section>

          <section className={individual ? "mt-4 grid gap-4" : "mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_18rem]"}>
            <ChartFrame
              title="Entries"
              description="Posted entries by month. A count, not a combined total."
              rows={activity.rows.flatMap((row) =>
                activity.series.map((item) => ({ label: `${row.fullLabel} · ${item.label}`, detail: String(row[item.id] ?? 0) })),
              )}
            >
              <ActivityBars rows={activity.rows} series={activity.series} />
            </ChartFrame>
            {individual ? null : (
              <ChartFrame
                title="Matching"
                description="Activity from wallets, exchanges, and custodians compared with the journal."
                rows={status.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
              >
                <StatusDonut rows={status.rows} total={status.total} />
              </ChartFrame>
            )}
          </section>
        </div>
      </details>
    </>
  );
}
