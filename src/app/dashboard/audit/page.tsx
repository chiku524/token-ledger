import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";

export const metadata = { title: "Audit" };

export default async function AuditPage() {
  const { books } = await loadAuthorizedBooks();
  const events = [...books.auditEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));

  return (
    <>
      <PageHeader
        kicker="Who did what"
        title="Audit log"
        description="Postings, reversals, sign-ins, and user changes are appended here. The actor is the signed-in user. Example history keeps the original example actor. A viewer's entity scope does not hide organization audit events."
      />
      {events.length === 0 ? (
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No audit events yet.</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Audit events</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Subject</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="num text-left">{event.occurredAt.slice(0, 10)}</td>
                  <td>{event.actor}</td>
                  <td className="font-mono text-xs">{event.action}</td>
                  <td>
                    {event.subjectType}
                    <span className="mt-1 block text-xs text-ink-soft">{event.subjectId}</span>
                  </td>
                  <td>{event.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
