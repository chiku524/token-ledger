import { StatusBars, StatusDonut } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { reconciliationBySource, reconciliationStatus } from "@/data/charts";
import { loadBooks } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { formatQuantity, sourceName } from "@/data/present";

export const metadata = { title: "Reconciliation" };

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const params = await searchParams;
  const books = await loadBooks();
  const parsed = parseDateRange({ from: one(params.from), to: one(params.to) }, { from: books.period.start, to: books.period.end });
  const range = parsed.ok ? parsed.range : { from: books.period.start, to: books.period.end };
  const scoped = sliceBooks(books, range);
  const ordered = [...scoped.reconciliations].sort((a, b) => {
    if (a.status !== b.status) return a.status === "exception" ? -1 : 1;
    return a.periodStart.localeCompare(b.periodStart) || a.id.localeCompare(b.id);
  });
  const externalId = new Map(books.sourceTransactions.map((transaction) => [transaction.id, transaction.externalId]));
  const status = reconciliationStatus(scoped);
  const bySource = reconciliationBySource(scoped);

  return (
    <>
      <PageHeader
        kicker={`${range.from} – ${range.to}`}
        title="Reconciliation"
        description="Source activity is matched to ledger movements on entity, source, asset, direction, and quantity. A match is exact. Anything left on either side is an exception."
      />
      {!parsed.ok ? (
        <p role="alert" className="mb-6 text-sm text-seal">
          {parsed.message}
        </p>
      ) : null}
      <PeriodForm path="/dashboard/reconciliation" range={range} />
      {ordered.length === 0 ? (
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No reconciliation rows in this date range.</p>
      ) : (
        <>
          <div className="mb-8 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <ChartFrame
              title="Status"
              description="Matched movements and exceptions in this date range."
              rows={status.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
            >
              <StatusDonut rows={status.rows} total={status.total} />
            </ChartFrame>
            <ChartFrame
              title="By source"
              description="Matched movements and exceptions, counted separately."
              rows={bySource.map((row) => ({
                label: row.label,
                detail: `${row.matched} matched, ${row.exception} exceptions`,
              }))}
            >
              <StatusBars rows={bySource} />
            </ChartFrame>
          </div>
          <div className="overflow-x-auto border border-line bg-paper-raised">
            <table className="ledger-table">
              <caption className="sr-only">Reconciliation for {range.from} to {range.to}</caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                  <th scope="col">Source</th>
                  <th scope="col">External id</th>
                  <th scope="col">Journal</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((record) => (
                  <tr key={record.id}>
                    <td className={record.status === "exception" ? "font-medium text-seal" : "text-pine"}>
                      {record.status === "exception" ? "Exception" : "Matched"}
                    </td>
                    <td className="num text-left">{record.periodStart}</td>
                    <td>{sourceName(record.sourceId, books.sources)}</td>
                    <td className="num text-left">{record.sourceTransactionId ? externalId.get(record.sourceTransactionId) : "—"}</td>
                    <td>
                      {record.journalEntryId
                        ? `${books.journalEntries.find((entry) => entry.id === record.journalEntryId)?.reference ?? record.journalEntryId}:${record.journalLineNumber}`
                        : "—"}
                    </td>
                    <td className="num">
                      {record.direction === "out" ? "Out " : "In "}
                      {formatQuantity(record.quantityMinor, record.assetCode, books.assets)}
                    </td>
                    <td>{record.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
