import { StatusBars, StatusDonut } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { MatchControls, ReadOnlyNote, RoleNote, UnmatchControls } from "@/components/record-forms";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { reconciliationBySource, reconciliationStatus } from "@/data/charts";
import { candidateJournalLines } from "@/data/reconciliation";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { ledgerQuantityMovements } from "@/ledger";
import { formatQuantity, movementLabel, sourceName } from "@/data/present";

export const metadata = { title: "Matching" };

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const canMatch = can(session.role, "reconciliation.match");
  const writable = booksAreWritable() && !session.demo;
  const csrf = canMatch && writable ? await ensureCsrf() : "";
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
  const movements = ledgerQuantityMovements(books.journalEntries);
  const referenceOf = (entryId: string) => books.journalEntries.find((entry) => entry.id === entryId)?.reference ?? entryId;
  const transactionById = new Map(books.sourceTransactions.map((transaction) => [transaction.id, transaction]));

  return (
    <>
      <PageHeader
        kicker={`${range.from} – ${range.to}`}
        title="Matching"
        description="Activity from each wallet, exchange, and custodian is compared with the journal. Same company, place, asset, direction, and amount. Anything left over is unmatched."
      />
      {!parsed.ok ? (
        <p role="alert" className="mb-6 text-sm text-seal">
          {parsed.message}
        </p>
      ) : null}
      <PeriodForm path="/dashboard/reconciliation" range={range} />
      {!writable ? <div className="mb-4"><ReadOnlyNote demo={session.demo} /></div> : null}
      {!canMatch ? (
        <div className="mb-4">
          <RoleNote>You can view matching. Clearing an exception or undoing a match is for an owner, admin, or accountant.</RoleNote>
        </div>
      ) : null}
      {ordered.length === 0 ? (
        <p className="panel px-4 py-6 text-sm text-ink-soft">Nothing to match in these dates.</p>
      ) : (
        <>
          <div className="mb-8 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <ChartFrame
              title="Status"
              description="Matched and unmatched activity in these dates."
              rows={status.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
            >
              <StatusDonut rows={status.rows} total={status.total} />
            </ChartFrame>
            <ChartFrame
              title="By place"
              description="Matched and unmatched activity, counted separately for each wallet, exchange, and custodian."
              rows={bySource.map((row) => ({
                label: row.label,
                detail: `${row.matched} matched, ${row.exception} unmatched`,
              }))}
            >
              <StatusBars rows={bySource} />
            </ChartFrame>
          </div>
          <div className="overflow-x-auto panel">
            <table className="ledger-table">
              <caption className="sr-only">Matching for {range.from} to {range.to}</caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                  <th scope="col">Held at</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Entry</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Note</th>
                  {canMatch && writable ? <th scope="col">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {ordered.map((record) => {
                  const transaction = record.sourceTransactionId ? transactionById.get(record.sourceTransactionId) : undefined;
                  const candidates = transaction ? candidateJournalLines(transaction, movements, referenceOf) : [];
                  return (
                    <tr key={record.id}>
                      <td className={record.status === "exception" ? "font-medium text-seal" : "text-pine"}>
                        {record.status === "exception" ? "Unmatched" : "Matched"}
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
                        {movementLabel(record.direction)} {formatQuantity(record.quantityMinor, record.assetCode, books.assets)}
                      </td>
                      <td>{record.note}</td>
                      {canMatch && writable ? (
                        <td>
                          {record.status === "exception" && transaction ? (
                            <MatchControls sourceTransactionId={transaction.id} candidates={candidates} csrf={csrf} />
                          ) : record.sourceTransactionId ? (
                            <UnmatchControls sourceTransactionId={record.sourceTransactionId} csrf={csrf} />
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
