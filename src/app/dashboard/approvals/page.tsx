import { CheckCircle2 } from "lucide-react";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { DraftApprovalControls, DraftSubmitControls, ReadOnlyNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { entityName, formatMoney } from "@/data/present";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DraftRow } from "@/db/drafts";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const canApprove = can(session.role, "journal.approve");
  const canPrepare = can(session.role, "journal.prepare");
  const writable = booksAreWritable() && !session.demo;
  const csrf = await ensureCsrf();

  let drafts: DraftRow[] = [];
  if (writable && canPrepare) {
    const { listOpenDrafts } = await import("@/db/drafts");
    drafts = await listOpenDrafts(session.organizationId);
  }

  return (
    <>
      <PageHeader
        kicker="Segregation of duties"
        title="Approvals"
        description="A prepared entry waits here until an approver posts it. The approver cannot approve an entry they prepared unless an owner overrides with a note. Posted entries are immutable."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />

      {!writable ? <div className="mb-6"><ReadOnlyNote demo={session.demo} /></div> : null}
      {!canPrepare ? (
        <EmptyState>Approval is for an owner, admin, accountant, or approver.</EmptyState>
      ) : drafts.length === 0 ? (
        <EmptyState icon={CheckCircle2}>Nothing is waiting for approval.</EmptyState>
      ) : (
        <TableCard className="mt-0">
          <Table>
            <caption className="sr-only">Entries awaiting approval</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead>Prepared by</TableHead>
                <NumberHead>Amount</NumberHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts.map((draft) => (
                <TableRow key={draft.id}>
                  <TableCell>{entityName(draft.entityId, books.entities)}</TableCell>
                  <TableCell>{draft.reference}</TableCell>
                  <TableCell>{draft.entryDate}</TableCell>
                  <TableCell>{draft.memo}</TableCell>
                  <TableCell>{draft.preparedBy}</TableCell>
                  <NumberCell>{formatMoney(draft.debitMinor, draft.currency)}</NumberCell>
                  <TableCell>
                    <StatusBadge tone={draft.status === "pending" ? "warning" : "neutral"}>
                      {draft.status === "pending" ? "Awaiting approval" : "Draft"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {draft.status === "draft" ? (
                      <DraftSubmitControls draftId={draft.id} csrf={csrf} />
                    ) : canApprove && writable ? (
                      <DraftApprovalControls draftId={draft.id} csrf={csrf} isOwner={session.role === "owner"} />
                    ) : (
                      <span className="text-sm text-muted-foreground">Awaiting an approver</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {!canApprove ? (
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          You can prepare and submit entries. Posting them is for an approver.
        </p>
      ) : null}
    </>
  );
}
