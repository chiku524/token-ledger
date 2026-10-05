import Link from "next/link";
import { ActivityBars, MoneyBars, MoneyLine, StatusDonut } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { SectionHeader } from "@/components/app/section-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyRow, NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Stagger } from "@/components/motion/stagger";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  assetAllocationPanels,
  carryingSeries,
  compositionPanels,
  journalActivityChart,
  reconciliationStatus,
} from "@/data/charts";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { entityName, formatMoney } from "@/data/present";
import { trialBalance } from "@/ledger";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const { session, books } = await loadAuthorizedBooks();
  const exceptions = books.reconciliations.filter((record) => record.status === "exception");
  const balances = books.entities.map((entity) => ({
    entity,
    report: trialBalance(books.journalEntries, books.accounts, entity.id),
  }));
  const inBalance = balances.every((item) => item.report.debitTotal === item.report.creditTotal);
  const recent = [...books.journalEntries].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 4);
  const allocation = assetAllocationPanels(books);
  const series = carryingSeries(books);
  const composition = compositionPanels(books);
  const activity = journalActivityChart(books);
  const status = reconciliationStatus(books);
  const currencyNote = booksAreWritable() && !session.demo
    ? "Each chart stays in that company's currency. The Combined page converts them into one currency."
    : "Sample figures. Each chart stays in that company's currency. The Combined page converts them with sample rates, not a market price.";

  return (
    <>
      <PageHeader
        kicker={books.period.label}
        title={books.organization.name}
        description={
          books.organization.origin === "example"
            ? "A sample group: a parent company in Malaysia and a company in Singapore."
            : "Saved books for this organization."
        }
      />

      <Stagger className="grid grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="Companies" value={books.entities.length} />
        <StatCard label="Wallets and accounts" value={books.sources.length} />
        <StatCard label="Unmatched" value={exceptions.length} tone={exceptions.length ? "danger" : "success"} />
        <StatCard label="Books" value={inBalance ? "In balance" : "Out of balance"} tone={inBalance ? "success" : "danger"} />
      </Stagger>

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

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_18rem]">
        <ChartFrame
          title="Entries"
          description="Posted entries by month. A count, not a combined total."
          rows={activity.rows.flatMap((row) =>
            activity.series.map((item) => ({ label: `${row.fullLabel} · ${item.label}`, detail: String(row[item.id] ?? 0) })),
          )}
        >
          <ActivityBars rows={activity.rows} series={activity.series} />
        </ChartFrame>
        <ChartFrame
          title="Matching"
          description="Activity from wallets, exchanges, and custodians compared with the journal."
          rows={status.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
        >
          <StatusDonut rows={status.rows} total={status.total} />
        </ChartFrame>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {balances.map(({ entity, report }) => (
          <Card key={entity.id}>
            <CardContent>
              <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                {entity.jurisdiction} · {entity.functionalCurrency}
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">{entity.name}</h2>
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

      {exceptions[0] ? (
        <Card className="mt-8 border-danger/40">
          <CardContent>
            <h2 className="font-medium text-danger">Unmatched activity</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {books.sourceTransactions.find((transaction) => transaction.id === exceptions[0]?.sourceTransactionId)?.description}{" "}
              <Link
                href={`/dashboard/reconciliation?from=${exceptions[0].periodStart}&to=${exceptions[0].periodEnd}`}
                className="text-foreground underline"
              >
                See what did not match
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="mt-10">
        <SectionHeader title="Recent entries" />
        <TableCard>
          <Table>
            <caption className="sr-only">Recent journal entries</caption>
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
    </>
  );
}
