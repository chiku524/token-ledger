import { reverseJournalAction } from "@/app/dashboard/actions";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { JournalForm, ReadOnlyNote } from "@/components/record-forms";
import { booksAreWritable, loadBooks } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { accountLabel, entityName, formatMoney, formatQuantity, movementLabel, sourceName } from "@/data/present";

export const metadata = { title: "Journal" };

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[]; error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const books = await loadBooks();
  const parsed = parseDateRange({ from: one(params.from), to: one(params.to) }, { from: books.period.start, to: books.period.end });
  const range = parsed.ok ? parsed.range : { from: books.period.start, to: books.period.end };
  const visible = sliceBooks(books, range).journalEntries;
  const writable = booksAreWritable();
  const reversed = new Set(books.journalEntries.map((entry) => entry.reversesEntryId).filter((id): id is string => Boolean(id)));

  return (
    <>
      <PageHeader
        kicker="Entries"
        title="Journal"
        description="Posted entries stay as they were written. To fix one, post a correction. A token amount on a line says which wallet, exchange, or custodian moved."
      />
      <Flash error={one(params.error) ?? (parsed.ok ? undefined : parsed.message)} saved={one(params.saved)} />
      <PeriodForm path="/dashboard/ledger" range={range} />
      {writable ? <JournalForm books={books} /> : <ReadOnlyNote />}
      {visible.length === 0 ? (
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No entries in these dates.</p>
      ) : (
        <div className="space-y-6">
          {visible.map((entry) => (
            <article key={entry.id} className="border border-line bg-paper-raised">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <h2 className="font-medium">
                    {entry.reference}
                    <span className="ml-3 font-normal text-ink-soft">{entry.entryDate}</span>
                  </h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    {entityName(entry.entityId, books.entities)} · {entry.memo}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Posted by {entry.postedBy}
                    {entry.reversesEntryId
                      ? ` · corrects ${books.journalEntries.find((item) => item.id === entry.reversesEntryId)?.reference ?? entry.reversesEntryId}`
                      : ""}
                  </p>
                </div>
                <p className="text-sm text-pine">Balanced {formatMoney(entry.debitMinor, entry.currency)}</p>
              </header>
              <div className="overflow-x-auto">
                <table className="ledger-table">
                  <caption className="sr-only">{entry.reference} lines</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Account</th>
                      <th scope="col">Quantity</th>
                      <th scope="col" className="num">Debit</th>
                      <th scope="col" className="num">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line) => (
                      <tr key={line.lineNumber}>
                        <td className="num text-left">{line.lineNumber}</td>
                        <td>
                          {accountLabel(entry.entityId, line.accountCode, books.accounts)}
                          {line.sourceId ? (
                            <span className="mt-1 block text-xs text-ink-soft">{sourceName(line.sourceId, books.sources)}</span>
                          ) : null}
                        </td>
                        <td>
                          {line.quantityMinor !== undefined && line.assetCode
                            ? `${movementLabel(line.quantityDirection === "out" ? "out" : "in")} ${formatQuantity(line.quantityMinor, line.assetCode, books.assets)}`
                            : "—"}
                        </td>
                        <td className="num">{line.side === "debit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                        <td className="num">{line.side === "credit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {writable && !reversed.has(entry.id) ? (
                <form action={reverseJournalAction} className="grid gap-3 border-t border-line px-4 py-3 md:grid-cols-4">
                  <input type="hidden" name="entryId" value={entry.id} />
                  <label className="field">
                    <span>Correction reference</span>
                    <input name="reference" required defaultValue={`${entry.reference}-R`} maxLength={40} />
                  </label>
                  <label className="field">
                    <span>Correction date</span>
                    <input name="entryDate" type="date" required defaultValue={entry.entryDate} />
                  </label>
                  <label className="field">
                    <span>Your name</span>
                    <input name="postedBy" required maxLength={80} autoComplete="name" />
                  </label>
                  <label className="field md:col-span-3">
                    <span>Memo</span>
                    <input name="memo" required maxLength={500} defaultValue={`Correct ${entry.reference}.`} />
                  </label>
                  <div className="md:col-span-4">
                    <button type="submit" className="btn-secondary">
                      Post correction
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
