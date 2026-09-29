import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { actionLabel, subjectLabel } from "@/data/present";

export const metadata = { title: "History" };

export default async function AuditPage() {
  const { books } = await loadAuthorizedBooks();
  const events = [...books.auditEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));

  return (
    <>
      <PageHeader
        kicker="Who did what"
        title="History"
        description="New companies, wallets and accounts, imports, posted entries, sign-ins, and user changes are listed here. Entries are not edited. The name is the person who signed in. Sample history keeps its original name. A person limited to one company still sees the whole group's history."
      />
      {events.length === 0 ? (
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">Nothing recorded yet.</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">History</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Name</th>
                <th scope="col">What happened</th>
                <th scope="col">About</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="num text-left">{event.occurredAt.slice(0, 10)}</td>
                  <td>{event.actor}</td>
                  <td>{actionLabel(event.action)}</td>
                  <td>
                    {subjectLabel(event.subjectType)}
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
