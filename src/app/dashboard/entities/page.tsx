import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { EntityForm, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { entityName } from "@/data/present";

export const metadata = { title: "Companies" };

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const allowed = can(session.role, "entity.write");
  const writable = booksAreWritable() && !session.demo;

  return (
    <>
      <PageHeader
        kicker="Organization"
        title="Companies"
        description="A parent company and the companies it owns. The Combined page converts their currencies into one view."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      {allowed ? (
        <>
          {writable ? null : <ReadOnlyNote demo={session.demo} />}
          <EntityForm books={books} csrf={await ensureCsrf()} />
        </>
      ) : (
        <RoleNote>You can view companies. Adding one is for owners and admins.</RoleNote>
      )}
      {books.entities.length === 0 ? (
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No companies yet.</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Companies</caption>
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Country</th>
                <th scope="col">Currency</th>
                <th scope="col">Standard</th>
                <th scope="col">Parent</th>
                <th scope="col" className="num">Accounts</th>
                <th scope="col" className="num">Places</th>
              </tr>
            </thead>
            <tbody>
              {books.entities.map((entity) => (
                <tr key={entity.id}>
                  <td>{entity.name}</td>
                  <td>{entity.jurisdiction}</td>
                  <td>{entity.functionalCurrency}</td>
                  <td>{entity.reportingFramework}</td>
                  <td>{entity.parentEntityId ? entityName(entity.parentEntityId, books.entities) : "—"}</td>
                  <td className="num">{books.accounts.filter((account) => account.entityId === entity.id).length}</td>
                  <td className="num">{books.sources.filter((source) => source.entityId === entity.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-sm text-ink-soft">
        {books.organization.name} · {books.organization.origin === "live" ? "Live" : "Example"}
      </p>
    </>
  );
}
