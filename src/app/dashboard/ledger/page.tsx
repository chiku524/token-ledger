import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { JournalForm, ReadOnlyNote, ReverseJournalForm, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { accountLabel, entityName, formatMoney, formatQuantity, sourceName } from "@/data/present";

export const metadata = { title: "Ledger" };

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[]; error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const parsed = parseDateRange({ from: one(params.from), to: one(params.to) }, { from: books.period.start, to: books.period.end });
  const range = parsed.ok ? parsed.range : { from: books.period.start, to: books.period.end };
  const visible = sliceBooks(books, range).journalEntries;
  const writable = booksAreWritable() && !session.demo;
  const canPost = can(session.role, "journal.post");
  const canReverse = can(session.role, "journal.reverse");
  const csrf = canPost || canReverse ? await ensureCsrf() : "";
  const reversed = new Set(books.journalEntries.map((entry) => entry.reversesEntryId).filter((id): id is string => Boolean(id)));

  return (
    <>
      <PageHeader
        kicker="Journal"
        title="Double-entry ledger"
        description="Posted entries stay as they were written. A correction is a reversal, which the ledger balances before it is stored. Token quantities sit on the line as subledger detail."
      />
      <Flash error={one(params.error) ?? (parsed.ok ? undefined : parsed.message)} saved={one(params.saved)} />
      <PeriodForm path="/dashboard/ledger" range={range} />
      {canPost ? (
        <>
          {writable ? null : <ReadOnlyNote demo={session.demo} />}
          <JournalForm books={books} csrf={csrf} />
        </>
      ) : (
        <RoleNote>This role is read-only. You can view journals and export CSVs. Posting and reversals are hidden.</RoleNote>
      )}
      {visible.length === 0 ? (
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No journals in this date range.</p>
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
                      ? ` · reverses ${books.journalEntries.find((item) => item.id === entry.reversesEntryId)?.reference ?? entry.reversesEntryId}`
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
                            ? `${line.quantityDirection === "out" ? "Out " : "In "}${formatQuantity(line.quantityMinor, line.assetCode, books.assets)}`
                            : "—"}
                        </td>
                        <td className="num">{line.side === "debit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                        <td className="num">{line.side === "credit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canReverse && !reversed.has(entry.id) ? <ReverseJournalForm csrf={csrf} entry={entry} /> : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
