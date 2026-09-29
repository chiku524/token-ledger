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
    ? "Each panel stays in that entity's functional currency. Group translation is on Consolidation."
    : "Example books. Each panel uses that entity's functional currency. Group translation, using labelled example rates, is on Consolidation.";

  return (
    <>
      <PageHeader
        kicker={books.period.label}
        title={books.organization.name}
        description={
          books.organization.origin === "example"
            ? "A fictional group with a Malaysian parent and a Singapore subsidiary. These books are posted through the double-entry module."
            : "Books read from Postgres for this organization."
        }
      />

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entities" value={String(books.entities.length)} />
        <Stat label="Sources" value={String(books.sources.length)} />
        <Stat label="Open exceptions" value={String(exceptions.length)} tone={exceptions.length ? "seal" : "pine"} />
        <Stat label="Trial balance" value={inBalance ? "In balance" : "Out of balance"} tone={inBalance ? "pine" : "seal"} />
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
            title={`Carrying value · ${panel.title}`}
            description="Digital-asset carrying amount after each journal date."
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
            title={`Assets · ${panel.title}`}
            description="Net carrying amount of asset accounts. Inventory with no movements is omitted."
            rows={panel.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
          >
            <MoneyBars rows={panel.rows} currency={panel.currency} />
          </ChartFrame>
        ))}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_18rem]">
        <ChartFrame
          title="Journal activity"
          description="Posted entries by month. Counts, not a converted total."
          rows={activity.rows.flatMap((row) =>
            activity.series.map((item) => ({ label: `${row.fullLabel} · ${item.label}`, detail: String(row[item.id] ?? 0) })),
          )}
        >
          <ActivityBars rows={activity.rows} series={activity.series} />
        </ChartFrame>
        <ChartFrame
          title="Reconciliation"
          description="Exact matches against source transactions."
          rows={status.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
        >
          <StatusDonut rows={status.rows} total={status.total} />
        </ChartFrame>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {balances.map(({ entity, report }) => (
          <article key={entity.id} className="border border-line bg-paper-raised p-5">
            <p className="text-xs tracking-[0.14em] text-ink-soft uppercase">{entity.jurisdiction} · {entity.functionalCurrency}</p>
            <h2 className="mt-2 font-serif text-2xl">{entity.name}</h2>
            <p className="mt-3 text-sm text-ink-soft">
              {entity.reportingFramework}
              {entity.parentEntityId ? ` · subsidiary of ${entityName(entity.parentEntityId)}` : " · parent"}
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
          <h2 className="font-medium text-seal">Reconciliation exception</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {books.sourceTransactions.find((transaction) => transaction.id === exceptions[0]?.sourceTransactionId)?.description}{" "}
            <Link href="/dashboard/reconciliation" className="text-ink underline">
              Review the match list
            </Link>
          </p>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Latest journals</h2>
        <div className="mt-4 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Latest journal entries</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Reference</th>
                <th scope="col">Entity</th>
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
    <div className="border border-line bg-paper-raised px-4 py-3">
      <dt className="text-[0.68rem] tracking-[0.14em] text-ink-soft uppercase">{label}</dt>
      <dd className={`mt-1 font-serif text-2xl ${color}`}>{value}</dd>
    </div>
  );
}
