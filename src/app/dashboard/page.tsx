import Link from "next/link";
import { ActivityBars, MoneyBars, MoneyLine, StatusDonut } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { PageHeader } from "@/components/page-header";
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

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Companies" value={String(books.entities.length)} />
        <Stat label="Wallets and accounts" value={String(books.sources.length)} />
        <Stat label="Unmatched" value={String(exceptions.length)} tone={exceptions.length ? "seal" : "pine"} />
        <Stat label="Books" value={inBalance ? "In balance" : "Out of balance"} tone={inBalance ? "pine" : "seal"} />
      </dl>

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
          <article key={entity.id} className="panel p-5">
            <p className="text-xs tracking-[0.14em] text-ink-soft uppercase">{entity.jurisdiction} · {entity.functionalCurrency}</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">{entity.name}</h2>
            <p className="mt-3 text-sm text-ink-soft">
              {entity.reportingFramework}
              {entity.parentEntityId ? ` · part of ${entityName(entity.parentEntityId)}` : " · parent company"}
            </p>
            <p className="mt-4 text-sm">
              Debits {report.currency ? formatMoney(report.debitTotal, report.currency) : "—"}
              <span className="text-ink-soft"> = </span>
              credits {report.currency ? formatMoney(report.creditTotal, report.currency) : "—"}
            </p>
          </article>
        ))}
      </section>

      {exceptions[0] ? (
        <section className="mt-8 border border-seal/40 bg-paper-raised p-5">
          <h2 className="font-medium text-seal">Unmatched activity</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {books.sourceTransactions.find((transaction) => transaction.id === exceptions[0]?.sourceTransactionId)?.description}{" "}
            <Link href="/dashboard/reconciliation" className="text-ink underline">
              See what did not match
            </Link>
          </p>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Recent entries</h2>
        <div className="mt-4 overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">Recent journal entries</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Reference</th>
                <th scope="col">Company</th>
                <th scope="col">Memo</th>
                <th scope="col" className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td className="num text-left">{entry.entryDate}</td>
                  <td>
                    <Link href="/dashboard/ledger" className="underline">
                      {entry.reference}
                    </Link>
                  </td>
                  <td>{entityName(entry.entityId, books.entities)}</td>
                  <td>{entry.memo}</td>
                  <td className="num">{formatMoney(entry.debitMinor, entry.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "seal" | "pine" }) {
  const color = tone === "seal" ? "text-seal" : tone === "pine" ? "text-pine" : "text-ink";
  return (
    <div className="panel px-4 py-3">
      <dt className="text-xs font-medium text-ink-soft">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</dd>
    </div>
  );
}
