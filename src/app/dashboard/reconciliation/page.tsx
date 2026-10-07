import { GitCompare } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import { SectionHeader } from "@/components/app/section-header";
import { StatusBadge } from "@/components/app/status-badge";
import { NumberCell } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/submit-button";
import { StatusBars, StatusDonut } from "@/components/charts/lazy";
import { ChartFrame } from "@/components/charts/frame";
import { MatchControls, PeriodCloseForm, ReadOnlyNote, RoleNote, UnmatchControls } from "@/components/record-forms";
import { reopenPeriodAction } from "@/app/dashboard/actions";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { reconciliationBySource, reconciliationStatus } from "@/data/charts";
import { candidateJournalLines } from "@/data/reconciliation";
import { paginate, parsePage } from "@/data/pagination";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { ledgerQuantityMovements } from "@/ledger";
import { entityName, formatQuantity, movementLabel, sourceName } from "@/data/present";
import { requireSectionAccess } from "@/data/section-access";

export const metadata = { title: "Matching" };

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[]; error?: string | string[]; saved?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  await requireSectionAccess("/dashboard/reconciliation");
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
  const records = paginate(ordered, parsePage(one(params.page)));
  const externalId = new Map(books.sourceTransactions.map((transaction) => [transaction.id, transaction.externalId]));
  const status = reconciliationStatus(scoped);
  const bySource = reconciliationBySource(scoped);
  const movements = ledgerQuantityMovements(books.journalEntries);
  const referenceOf = (entryId: string) => books.journalEntries.find((entry) => entry.id === entryId)?.reference ?? entryId;
  const transactionById = new Map(books.sourceTransactions.map((transaction) => [transaction.id, transaction]));
  const canClose = can(session.role, "period.close");
  let locks: Array<{ id: string; entityId: string; periodStart: string; periodEnd: string; note: string }> = [];
  if (writable && canMatch) {
    const { listPeriodLocks } = await import("@/db/period-locks");
    locks = await listPeriodLocks(session.organizationId);
  }

  return (
    <>
      <PageHeader
        kicker={`${range.from} – ${range.to}`}
        title="Matching"
        description="Activity from each wallet, exchange, and custodian is compared with the journal. Same company, place, asset, direction, and amount. Anything left over is unmatched."
      />
      <Flash error={one(params.error) ?? (parsed.ok ? undefined : parsed.message)} saved={one(params.saved)} />
      <PeriodForm path="/dashboard/reconciliation" range={range} />
      {!writable ? <div className="mb-4"><ReadOnlyNote demo={session.demo} /></div> : null}
      {!canMatch ? (
        <div className="mb-4">
          <RoleNote>You can view matching. Clearing an exception or undoing a match is for an owner, admin, or accountant.</RoleNote>
        </div>
      ) : null}
      {ordered.length === 0 ? (
        <EmptyState icon={GitCompare}>Nothing to match in these dates.</EmptyState>
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
          <TableCard className="mt-0">
            <Table>
              <caption className="sr-only">Matching for {range.from} to {range.to}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Held at</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Note</TableHead>
                  {canMatch && writable ? <TableHead>Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.items.map((record) => {
                  const transaction = record.sourceTransactionId ? transactionById.get(record.sourceTransactionId) : undefined;
                  const candidates = transaction ? candidateJournalLines(transaction, movements, referenceOf) : [];
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <StatusBadge tone={record.status === "exception" ? "danger" : "success"}>
                          {record.status === "exception" ? "Unmatched" : "Matched"}
                        </StatusBadge>
                      </TableCell>
                      <NumberCell align="left">{record.periodStart}</NumberCell>
                      <TableCell className="min-w-40">{sourceName(record.sourceId, books.sources)}</TableCell>
                      <NumberCell align="left">{record.sourceTransactionId ? externalId.get(record.sourceTransactionId) : "—"}</NumberCell>
                      <TableCell className="whitespace-nowrap">
                        {record.journalEntryId
                          ? `${books.journalEntries.find((entry) => entry.id === record.journalEntryId)?.reference ?? record.journalEntryId}:${record.journalLineNumber}`
                          : "—"}
                      </TableCell>
                      <NumberCell align="left">
                        {movementLabel(record.direction)} {formatQuantity(record.quantityMinor, record.assetCode, books.assets)}
                      </NumberCell>
                      <TableCell className="min-w-48">{record.note}</TableCell>
                      {canMatch && writable ? (
                        <TableCell>
                          {record.status === "exception" && transaction ? (
                            <MatchControls sourceTransactionId={transaction.id} candidates={candidates} csrf={csrf} />
                          ) : record.sourceTransactionId ? (
                            <UnmatchControls sourceTransactionId={record.sourceTransactionId} csrf={csrf} />
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
          <Pagination
            page={records}
            base="/dashboard/reconciliation"
            query={{ from: range.from, to: range.to }}
            label="Matching pages"
          />
        </>
      )}

      {writable && canMatch ? (
        <section className="mt-10">
          <SectionHeader
            title="Period close"
            description="A closed period cannot be posted to, reversed, or re-matched until it is reopened. Closing is for an owner or admin."
          />
          {locks.length > 0 ? (
            <TableCard>
              <Table>
                <caption className="sr-only">Closed periods</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Note</TableHead>
                    {canClose ? <TableHead>Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locks.map((lock) => (
                    <TableRow key={lock.id}>
                      <TableCell className="min-w-36">{entityName(lock.entityId, books.entities)}</TableCell>
                      <NumberCell align="left">{lock.periodStart}</NumberCell>
                      <NumberCell align="left">{lock.periodEnd}</NumberCell>
                      <TableCell className="min-w-48">{lock.note}</TableCell>
                      {canClose ? (
                        <TableCell>
                          <form action={reopenPeriodAction}>
                            <input type="hidden" name="csrf" value={csrf} />
                            <input type="hidden" name="lockId" value={lock.id} />
                            <SubmitButton variant="secondary">Reopen</SubmitButton>
                          </form>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          ) : (
            <EmptyState className="mt-4">No periods are closed.</EmptyState>
          )}
          {canClose ? <PeriodCloseForm entities={books.entities} csrf={csrf} defaultDate={range.to} /> : null}
        </section>
      ) : null}
    </>
  );
}
