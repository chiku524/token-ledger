import { BookOpen, Calendar } from "lucide-react";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { StatusBadge } from "@/components/app/status-badge";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { JournalForm, ReadOnlyNote, ReverseJournalForm, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { paginate, parsePage } from "@/data/pagination";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sliceBooks } from "@/data/slice-books";
import { accountLabel, entityName, formatMoney, formatQuantity, movementLabel, sourceName } from "@/data/present";
import { requireSectionAccess } from "@/data/section-access";

export const metadata = { title: "Journal" };

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
  const writable = booksAreWritable() && !session.demo;
  const canPost = can(session.role, "journal.post");
  const canReverse = can(session.role, "journal.reverse");
  const csrf = canPost || canReverse ? await ensureCsrf() : "";
  const reversed = new Set(books.journalEntries.map((entry) => entry.reversesEntryId).filter((id): id is string => Boolean(id)));

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
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
              <JournalForm books={books} csrf={csrf} />
            </div>
          </details>
        </>
      ) : (
        <RoleNote>You can view entries and download CSVs. Posting and corrections are hidden.</RoleNote>
      )}
      {visible.length === 0 ? (
        <EmptyState icon={BookOpen}>No entries in these dates. Widen the dates above to see more.</EmptyState>
      ) : (
        <div className="space-y-6">
          {entries.items.map((entry) => (
            <Card key={entry.id} className="gap-0 py-0">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="font-medium">
                    {entry.reference}
                    <span className="ml-3 font-normal text-muted-foreground">{entry.entryDate}</span>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entityName(entry.entityId, books.entities)} · {entry.memo}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Posted by {entry.postedBy}
                    {entry.reversesEntryId
                      ? ` · corrects ${books.journalEntries.find((item) => item.id === entry.reversesEntryId)?.reference ?? entry.reversesEntryId}`
                      : ""}
                  </p>
                </div>
                <StatusBadge tone="success">Balanced {formatMoney(entry.debitMinor, entry.currency)}</StatusBadge>
              </header>
              <Table>
                <caption className="sr-only">{entry.reference} lines</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Quantity</TableHead>
                    <NumberHead>Debit</NumberHead>
                    <NumberHead>Credit</NumberHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.lines.map((line) => (
                    <TableRow key={line.lineNumber}>
                      <NumberCell align="left">{line.lineNumber}</NumberCell>
                      <TableCell className="min-w-40">
                        {accountLabel(entry.entityId, line.accountCode, books.accounts)}
                        {line.sourceId ? (
                          <span className="mt-1 block text-xs text-muted-foreground">{sourceName(line.sourceId, books.sources)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {line.quantityMinor !== undefined && line.assetCode
                          ? `${movementLabel(line.quantityDirection === "out" ? "out" : "in")} ${formatQuantity(line.quantityMinor, line.assetCode, books.assets)}`
                          : "—"}
                      </TableCell>
                      <NumberCell>{line.side === "debit" ? formatMoney(line.amountMinor, line.currency) : ""}</NumberCell>
                      <NumberCell>{line.side === "credit" ? formatMoney(line.amountMinor, line.currency) : ""}</NumberCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {canReverse && !reversed.has(entry.id) ? <ReverseJournalForm csrf={csrf} entry={entry} /> : null}
            </Card>
          ))}
        </div>
      )}
      <Pagination page={entries} base="/dashboard/ledger" query={{ from: range.from, to: range.to }} label="Journal pages" />
    </>
  );
}
