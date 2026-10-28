import Link from "next/link";
import { Calendar, Download, FileSpreadsheet, Wallet } from "lucide-react";
import { ChartFrame } from "@/components/charts/frame";
import { MoneyBars, MoneyLine } from "@/components/charts/lazy";
import { EmptyState } from "@/components/app/empty-state";
import { IndividualActivityTables } from "@/components/app/individual-activity";
import { SectionHeader } from "@/components/app/section-header";
import { SegmentedLinks } from "@/components/app/segmented-links";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Books } from "@/data/books";
import type { LinePanel, MoneyRow } from "@/data/charts";
import { HOLDINGS_DISPLAY_CURRENCIES } from "@/data/display-currency";
import {
  INDIVIDUAL_REPORT_NAMES,
  INDIVIDUAL_REPORT_NOTICE,
  activityHistory,
  individualCurrency,
  portfolioSummary,
  valueOverTime,
} from "@/data/individual-reports";
import type { DateRange } from "@/data/period";
import { minorToNumber } from "@/ledger";

export type IndividualReportTab = "portfolio" | "activity" | "value";

const TABS: ReadonlyArray<{ key: IndividualReportTab; label: string }> = [
  { key: "portfolio", label: INDIVIDUAL_REPORT_NAMES.portfolio },
  { key: "activity", label: INDIVIDUAL_REPORT_NAMES.activity },
  { key: "value", label: INDIVIDUAL_REPORT_NAMES.valueOverTime },
];

export function parseIndividualTab(value: string | undefined): IndividualReportTab {
  return TABS.find((tab) => tab.key === value)?.key ?? "portfolio";
}

function axisDate(iso: string): string {
  return iso.slice(5);
}

export function IndividualReports({
  books,
  range,
  tab,
  currencyParam,
  canExport,
  error,
  saved,
}: {
  books: Books;
  range: DateRange;
  tab: IndividualReportTab;
  currencyParam: string | undefined;
  canExport: boolean;
  error?: string;
  saved?: string;
}) {
  const currency = individualCurrency(currencyParam, books.entities[0]?.functionalCurrency);
  const query = `from=${range.from}&to=${range.to}&currency=${currency}`;
  const tabLinks = TABS.map((item) => ({
    key: item.key,
    href: `/dashboard/reports?tab=${item.key}&${query}`,
    label: item.label,
    current: item.key === tab,
  }));
  const currencyLinks = HOLDINGS_DISPLAY_CURRENCIES.map((code) => ({
    key: code,
    href: `/dashboard/reports?tab=${tab}&from=${range.from}&to=${range.to}&currency=${code}`,
    label: code,
    current: code === currency,
  }));
  const downloads: Array<[string, string]> = [
    ["portfolio", INDIVIDUAL_REPORT_NAMES.portfolio],
    ["activity", INDIVIDUAL_REPORT_NAMES.activity],
    ["value-over-time", INDIVIDUAL_REPORT_NAMES.valueOverTime],
  ];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">What you hold, what moved, and what it was worth.</p>
      </header>

      <Flash error={error} saved={saved} />

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <form method="get" action="/dashboard/reports" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="currency" value={currency} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5 shrink-0" />
            <Input type="date" name="from" aria-label="From date" defaultValue={range.from} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
            <span className="text-muted-foreground/60">to</span>
            <Input type="date" name="to" aria-label="To date" defaultValue={range.to} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
          </div>
          <SubmitButton variant="ghost" size="sm">Update</SubmitButton>
        </form>

        {canExport ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3 sm:border-0 sm:pt-0">
            <Button asChild variant="outline" size="sm">
              <a href={`/dashboard/reports/export?kind=pdf&${query}`} className="gap-1.5">
                <Download className="size-3.5" />
                PDF
              </a>
            </Button>
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                Download as CSV
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {downloads.map(([kind, label]) => (
                  <Button key={kind} asChild variant="ghost" size="sm">
                    <a href={`/dashboard/reports/export?kind=${kind}&${query}`} className="gap-1.5">
                      <FileSpreadsheet className="size-3.5" />
                      {label}
                    </a>
                  </Button>
                ))}
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <SegmentedLinks label="Report" items={tabLinks} />
        <SegmentedLinks label="Value currency" items={currencyLinks} />
      </div>

      {tab === "portfolio" ? <PortfolioTab books={books} range={range} currency={currency} /> : null}
      {tab === "activity" ? <ActivityTab books={books} range={range} /> : null}
      {tab === "value" ? <ValueTab books={books} range={range} currency={currency} /> : null}

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">{INDIVIDUAL_REPORT_NOTICE}</p>
    </>
  );
}

function PortfolioTab({ books, range, currency }: { books: Books; range: DateRange; currency: string }) {
  const summary = portfolioSummary(books, { asOf: range.to, currency });
  const empty = summary.rows.length === 0 && summary.unpriced.length === 0;
  const bars: MoneyRow[] = summary.rows.map((row) => ({
    id: row.assetCode,
    label: row.assetCode,
    value: minorToNumber(row.valueMinor, 2),
    formatted: `${row.value} \u00b7 ${row.shareLabel}`,
  }));

  if (empty) {
    return (
      <EmptyState
        icon={Wallet}
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard/sources">Open Holdings</Link>
          </Button>
        }
      >
        No holdings as of {range.to}. Connect a wallet or exchange and press Check, and your portfolio shows here.
      </EmptyState>
    );
  }

  return (
    <section>
      <SectionHeader
        title={INDIVIDUAL_REPORT_NAMES.portfolio}
        description={`What you hold as of ${range.to}, valued in ${currency} at the latest saved prices.`}
      />
      {summary.partial ? (
        <Alert variant="warning" className="mt-3 max-w-2xl">
          Some holdings have no price or an old one, so treat the total as an estimate.
        </Alert>
      ) : null}
      {bars.length > 0 ? (
        <div className="mt-4">
          <ChartFrame
            title={`Allocation \u00b7 ${currency}`}
            description="Each asset as a share of the portfolio."
            rows={bars.map((row) => ({ label: row.label, detail: row.formatted }))}
          >
            <MoneyBars rows={bars} currency={currency} />
          </ChartFrame>
        </div>
      ) : null}
      <TableCard>
        <Table>
          <caption className="sr-only">Portfolio summary as of {range.to}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Asset</TableHead>
              <NumberHead scope="col">Amount</NumberHead>
              <NumberHead scope="col">Value</NumberHead>
              <NumberHead scope="col">Share</NumberHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.map((row) => (
              <TableRow key={row.assetCode}>
                <TableCell>
                  {row.assetCode}
                  <span className="ml-2 text-xs text-muted-foreground">{row.assetName}</span>
                </TableCell>
                <NumberCell>{row.amount}</NumberCell>
                <NumberCell>{row.value}</NumberCell>
                <NumberCell>{row.shareLabel}</NumberCell>
              </TableRow>
            ))}
            {summary.unpriced.map((row) => (
              <TableRow key={`unpriced_${row.assetCode}`}>
                <TableCell>{row.assetCode}</TableCell>
                <NumberCell>{row.amount}</NumberCell>
                <NumberCell className="text-muted-foreground">No price</NumberCell>
                <NumberCell className="text-muted-foreground">-</NumberCell>
              </TableRow>
            ))}
          </TableBody>
          {summary.rows.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableHead scope="row">Total</TableHead>
                <TableCell />
                <NumberCell>{summary.total}</NumberCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </TableCard>
    </section>
  );
}

function ActivityTab({ books, range }: { books: Books; range: DateRange }) {
  const history = activityHistory(books, range);
  return (
    <section>
      <SectionHeader
        title={INDIVIDUAL_REPORT_NAMES.activity}
        description={`Transactions and balance changes from ${range.from} to ${range.to}, read from your wallets and exchanges.`}
      />
      <div className="mt-4">
        <IndividualActivityTables
          history={history}
          emptyHint="No transactions in these dates. Widen the dates above, or press Check on a connection in Settings."
        />
      </div>
    </section>
  );
}

function ValueTab({ books, range, currency }: { books: Books; range: DateRange; currency: string }) {
  const series = valueOverTime(books, { range, currency });
  const panel: LinePanel = {
    id: "value-over-time",
    title: `${INDIVIDUAL_REPORT_NAMES.valueOverTime} \u00b7 ${currency}`,
    points: series.points.map((point) => ({
      id: point.date,
      label: point.date,
      axisLabel: axisDate(point.date),
      value: minorToNumber(point.valueMinor, 2),
      formatted: point.value,
    })),
  };
  return (
    <section>
      <SectionHeader
        title={INDIVIDUAL_REPORT_NAMES.valueOverTime}
        description={`The total value of everything you hold, in ${currency}, on each day a balance was checked.`}
      />
      {series.points.length === 0 ? (
        <EmptyState className="mt-4" icon={Wallet}>
          Not enough history yet. Value over time builds up each time a balance is checked and a price is saved.
        </EmptyState>
      ) : (
        <>
          <div className="mt-4">
            <ChartFrame
              title={panel.title}
              rows={panel.points.map((point) => ({ label: point.label, detail: point.formatted }))}
            >
              <MoneyLine panel={panel} />
            </ChartFrame>
          </div>
          <TableCard>
            <Table>
              <caption className="sr-only">Value over time</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Date</TableHead>
                  <NumberHead scope="col">Value</NumberHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...series.points].reverse().map((point) => (
                  <TableRow key={point.date}>
                    <NumberCell align="left">{point.date}</NumberCell>
                    <NumberCell>{point.value}</NumberCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </>
      )}
      {series.skipped > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {series.skipped} {series.skipped === 1 ? "day was" : "days were"} left out because a holding had no saved price yet.
        </p>
      ) : null}
    </section>
  );
}
