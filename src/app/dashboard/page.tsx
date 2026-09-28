import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { exampleBooks } from "@/data/example-books";
import { entityName, formatMoney } from "@/data/present";
import { trialBalance } from "@/ledger";

export const metadata = { title: "Overview" };

export default function DashboardPage() {
  const exceptions = exampleBooks.reconciliations.filter((record) => record.status === "exception");
  const balances = exampleBooks.entities.map((entity) => ({
    entity,
    report: trialBalance(exampleBooks.journalEntries, exampleBooks.accounts, entity.id),
  }));
  const inBalance = balances.every((item) => item.report.debitTotal === item.report.creditTotal);
  const recent = [...exampleBooks.journalEntries].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 4);

  return (
    <>
      <PageHeader
        kicker={exampleBooks.period.label}
        title={exampleBooks.organization.name}
        description="A fictional group with a Malaysian parent and a Singapore subsidiary. These books are the seed data, posted through the double-entry module."
      />

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entities" value={String(exampleBooks.entities.length)} />
        <Stat label="Sources" value={String(exampleBooks.sources.length)} />
        <Stat label="Open exceptions" value={String(exceptions.length)} tone={exceptions.length ? "seal" : "pine"} />
        <Stat label="Trial balance" value={inBalance ? "In balance" : "Out of balance"} tone={inBalance ? "pine" : "seal"} />
      </dl>

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
            {exampleBooks.sourceTransactions.find((transaction) => transaction.id === exceptions[0]?.sourceTransactionId)?.description}{" "}
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
            <caption className="sr-only">Latest example journal entries</caption>
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
                  <td>{entityName(entry.entityId)}</td>
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
