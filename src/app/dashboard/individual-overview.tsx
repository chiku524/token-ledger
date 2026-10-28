import Link from "next/link";
import { mePath } from "@/data/me-paths";
import { Wallet } from "lucide-react";
import { ChartFrame } from "@/components/charts/frame";
import { MoneyBars, MoneyLine } from "@/components/charts/lazy";
import { EmptyState } from "@/components/app/empty-state";
import { GainLossPanel } from "@/components/app/gain-loss-panel";
import { SectionHeader } from "@/components/app/section-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyRow, NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Stagger } from "@/components/motion/stagger";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Books } from "@/data/books";
import type { LinePanel, MoneyRow } from "@/data/charts";
import { holdingsGainLoss } from "@/data/gain-loss";
import { activityHistory, individualCurrency, portfolioSummary, valueOverTime } from "@/data/individual-reports";
import { minorToNumber } from "@/ledger";

/** How many recent movements the overview lists. */
const RECENT_ROWS = 5;

/**
 * An individual's overview: what they hold and what it is worth, what moved
 * lately, and how their value has changed. Everything here is read from
 * connected wallets and exchanges.
 */
export function IndividualOverview({ books, gainLossCurrency }: { books: Books; gainLossCurrency?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const currency = individualCurrency(undefined, books.entities[0]?.functionalCurrency);
  const summary = portfolioSummary(books, { asOf: today, currency });
  const history = activityHistory(books, { from: "1970-01-01", to: today });
  const recent = [...history.transactions, ...history.balanceChanges]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, RECENT_ROWS);
  const series = valueOverTime(books, { range: { from: "1970-01-01", to: today }, currency });
  const gainLoss = holdingsGainLoss(books, { individual: true, currency: individualCurrency(gainLossCurrency, books.entities[0]?.functionalCurrency) });
  const hasHoldings = summary.rows.length > 0 || summary.unpriced.length > 0;
  const bars: MoneyRow[] = summary.rows.map((row) => ({
    id: row.assetCode,
    label: row.assetCode,
    value: minorToNumber(row.valueMinor, 2),
    formatted: `${row.value} \u00b7 ${row.shareLabel}`,
  }));
  const line: LinePanel = {
    id: "value-over-time",
    title: `Value over time \u00b7 ${currency}`,
    points: series.points.map((point) => ({
      id: point.date,
      label: point.date,
      axisLabel: point.date.slice(5),
      value: minorToNumber(point.valueMinor, 2),
      formatted: point.value,
    })),
  };

  return (
    <>
      <PageHeader
        kicker={books.period.label}
        title={books.organization.name}
        description={
          books.organization.origin === "example"
            ? "Sample figures for a personal account."
            : "Your holdings, activity, and reports in one place."
        }
      />

      <Stagger className="grid grid-cols-2 gap-2 sm:gap-3">
        <StatCard label={`Portfolio value \u00b7 ${currency}`} value={hasHoldings ? summary.total : "Nothing yet"} />
        <StatCard label="Wallets and accounts" value={books.sources.length} />
      </Stagger>

      <nav aria-label="Day to day" className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href={mePath("/dashboard/sources#observed-balances")} className="text-link underline">
          Holdings
        </Link>
        <Link href={mePath("/dashboard/ledger")} className="text-link underline">
          Activity
        </Link>
        <Link href={mePath("/dashboard/reports")} className="text-link underline">
          Reports
        </Link>
        <Link href={mePath("/dashboard/settings#connections")} className="text-muted-foreground underline hover:text-foreground">
          Connections
        </Link>
      </nav>

      {summary.partial && hasHoldings ? (
        <Alert variant="warning" className="mt-8 max-w-2xl">
          Some holdings have no price or an old one, so treat the total as an estimate.
        </Alert>
      ) : null}

      {hasHoldings ? null : (
        <EmptyState
          className="mt-8"
          icon={Wallet}
          action={
            <Button asChild variant="secondary">
              <Link href={mePath("/dashboard/setup")}>Connect a wallet or exchange</Link>
            </Button>
          }
        >
          No holdings yet. Connect a wallet or exchange and press Check to see what you hold and what it is worth.
        </EmptyState>
      )}

      {hasHoldings ? (
        <GainLossPanel
          gainLoss={gainLoss}
          id="gain-loss"
          className="mt-10 scroll-mt-6"
          currencyHref={(code) => mePath(`/dashboard?currency=${code}#gain-loss`)}
          action={
            <Link href={mePath(`/dashboard/sources?currency=${gainLoss.currency}#gain-loss`)} className="text-sm text-link underline">
              Open holdings
            </Link>
          }
        />
      ) : null}

      <section className="mt-10">
        <SectionHeader
          title="Recent activity"
          action={
            <Link href={mePath("/dashboard/ledger")} className="text-sm text-link underline">
              Open activity
            </Link>
          }
        />
        <TableCard>
          <Table>
            <caption className="sr-only">Recent activity</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">Asset</TableHead>
                <NumberHead scope="col">Amount</NumberHead>
                <TableHead scope="col">Account/Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 ? <EmptyRow colSpan={5}>No activity yet. It appears after a wallet or exchange is checked.</EmptyRow> : null}
              {recent.map((row) => (
                <TableRow key={`${row.type}-${row.id}`}>
                  <NumberCell align="left">{row.date}</NumberCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.assetCode}</TableCell>
                  <NumberCell className={row.quantityMinor < 0n ? "text-danger" : "text-success"}>{row.amount}</NumberCell>
                  <TableCell>{row.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      {hasHoldings ? (
        <details className="group mt-10" open>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Charts</summary>
          <div className="mt-6">
            <SectionHeader
              title="What you hold"
              description={`Values in ${currency} at the latest saved prices.`}
              action={
                <Link href={mePath("/dashboard/reports")} className="text-sm text-link underline">
                  Open reports
                </Link>
              }
            />
            <section className="mt-4 grid gap-4 xl:grid-cols-2">
              {bars.length > 0 ? (
                <ChartFrame
                  title={`Allocation \u00b7 ${currency}`}
                  description="Each asset as a share of the portfolio."
                  rows={bars.map((row) => ({ label: row.label, detail: row.formatted }))}
                >
                  <MoneyBars rows={bars} currency={currency} />
                </ChartFrame>
              ) : null}
              {line.points.length > 1 ? (
                <ChartFrame
                  title={line.title}
                  description="The total value of what you hold, on each day a balance was checked."
                  rows={line.points.map((point) => ({ label: point.label, detail: point.formatted }))}
                >
                  <MoneyLine panel={line} />
                </ChartFrame>
              ) : null}
            </section>
          </div>
        </details>
      ) : null}
    </>
  );
}
