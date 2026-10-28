import { BookOpen, Calendar } from "lucide-react";
import { ensureCsrf, getSession } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import { Flash } from "@/components/flash";
import { JournalEntryList, type JournalEntryView } from "@/components/journal-entry-list";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { JournalForm, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { journalName } from "@/data/account-sections";
import { booksAreWritable } from "@/data/load-books";
import { paginate, parsePage } from "@/data/pagination";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { accountLabel, entityName, formatMoney, formatQuantity, movementLabel, sourceName } from "@/data/present";
import { requireSectionAccess } from "@/data/section-access";

/** An individual's page is called Activity; an organization's stays Journal. */
export async function generateMetadata() {
  const session = await getSession();
  return { title: journalName(session?.accountType) };
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[]; error?: string | string[]; saved?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  await requireSectionAccess("/dashboard/ledger");
  const { session, books } = await loadAuthorizedBooks();
  const parsed = parseDateRange({ from: one(params.from), to: one(params.to) }, { from: books.period.start, to: books.period.end });
  const range = parsed.ok ? parsed.range : { from: books.period.start, to: books.period.end };
  const visible = sliceBooks(books, range).journalEntries;
  const entries = paginate(visible, parsePage(one(params.page)));
  const writable = booksAreWritable() && !session.demo && !session.demoBooks;
  const canPost = can(session.role, "journal.post");
  const canReverse = can(session.role, "journal.reverse");
  const title = journalName(session.accountType);
  const csrf = canPost || canReverse ? await ensureCsrf() : "";
  const reversed = new Set(books.journalEntries.map((entry) => entry.reversesEntryId).filter((id): id is string => Boolean(id)));

  const cards: JournalEntryView[] = entries.items.map((entry) => ({
    id: entry.id,
    reference: entry.reference,
    entryDate: entry.entryDate,
    memo: entry.memo,
    company: entityName(entry.entityId, books.entities),
    postedBy: entry.postedBy,
    correctsReference: entry.reversesEntryId
      ? (books.journalEntries.find((item) => item.id === entry.reversesEntryId)?.reference ?? entry.reversesEntryId)
      : null,
    amountLabel: `Balanced ${formatMoney(entry.debitMinor, entry.currency)}`,
    canCorrect: canReverse && !reversed.has(entry.id),
    lines: entry.lines.map((line) => ({
      lineNumber: line.lineNumber,
      account: accountLabel(entry.entityId, line.accountCode, books.accounts),
      source: line.sourceId ? sourceName(line.sourceId, books.sources) : null,
      quantity:
        line.quantityMinor !== undefined && line.assetCode
          ? `${movementLabel(line.quantityDirection === "out" ? "out" : "in")} ${formatQuantity(line.quantityMinor, line.assetCode, books.assets)}`
          : "—",
      debit: line.side === "debit" ? formatMoney(line.amountMinor, line.currency) : "",
      credit: line.side === "credit" ? formatMoney(line.amountMinor, line.currency) : "",
    })),
  }));

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Posted entries · {range.from} – {range.to}
        </p>
      </header>

      <Flash error={one(params.error) ?? (parsed.ok ? undefined : parsed.message)} saved={one(params.saved)} />

      <div className="mb-8 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm">
        <form method="get" action="/dashboard/ledger" className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5 shrink-0" />
            <Input type="date" name="from" aria-label="From date" defaultValue={range.from} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
            <span className="text-muted-foreground/60">—</span>
            <Input type="date" name="to" aria-label="To date" defaultValue={range.to} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
          </div>
          <SubmitButton variant="ghost" size="sm">Update</SubmitButton>
        </form>
      </div>
      {canPost ? (
        <>
          {writable ? null : <ReadOnlyNote demo={session.demo} />}
          <details className="group mb-8" {...(visible.length === 0 ? { open: true } : {})}>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Post an entry
            </summary>
            <div className="mt-4">
              <JournalForm books={books} csrf={csrf} accountType={session.accountType} />
            </div>
          </details>
        </>
      ) : (
        <RoleNote>You can view entries and download CSVs. Posting and corrections are hidden.</RoleNote>
      )}
      {visible.length === 0 ? (
        <EmptyState icon={BookOpen}>No entries in these dates. Widen the dates above to see more.</EmptyState>
      ) : (
        <JournalEntryList entries={cards} csrf={csrf} label={`${title} entries`} />
      )}
      <Pagination page={entries} base="/dashboard/ledger" query={{ from: range.from, to: range.to }} label={`${title} pages`} />
    </>
  );
}
