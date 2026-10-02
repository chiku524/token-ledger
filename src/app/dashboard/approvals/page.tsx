import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { DraftApprovalControls, DraftSubmitControls, ReadOnlyNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { entityName, formatMoney } from "@/data/present";
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
        <p className="panel px-4 py-6 text-sm text-ink-soft">
          Approval is for an owner, admin, accountant, or approver.
        </p>
      ) : drafts.length === 0 ? (
        <p className="panel px-4 py-6 text-sm text-ink-soft">Nothing is waiting for approval.</p>
      ) : (
        <div className="overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">Entries awaiting approval</caption>
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Reference</th>
                <th scope="col">Date</th>
                <th scope="col">Memo</th>
                <th scope="col">Prepared by</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>{entityName(draft.entityId, books.entities)}</td>
                  <td>{draft.reference}</td>
                  <td>{draft.entryDate}</td>
                  <td>{draft.memo}</td>
                  <td>{draft.preparedBy}</td>
                  <td className="num">{formatMoney(draft.debitMinor, draft.currency)}</td>
                  <td>{draft.status === "pending" ? "Awaiting approval" : "Draft"}</td>
                  <td>
                    {draft.status === "draft" ? (
                      <DraftSubmitControls draftId={draft.id} csrf={csrf} />
                    ) : canApprove && writable ? (
                      <DraftApprovalControls draftId={draft.id} csrf={csrf} isOwner={session.role === "owner"} />
                    ) : (
                      <span className="text-sm text-ink-soft">Awaiting an approver</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canApprove ? (
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-soft">
          You can prepare and submit entries. Posting them is for an approver.
        </p>
      ) : null}
    </>
  );
}
