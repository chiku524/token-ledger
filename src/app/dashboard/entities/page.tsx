import { PageHeader } from "@/components/page-header";
import { exampleAccounts, exampleBooks, exampleEntities, exampleSources } from "@/data/example-books";
import { entityName } from "@/data/present";

export const metadata = { title: "Entities" };

export default function EntitiesPage() {
  return (
    <>
      <PageHeader
        kicker="Organization"
        title="Legal entities"
        description="Institutional reporting needs a parent and its subsidiaries in one place. Startup books can stay on a single entity. Consolidation itself is not calculated in this build."
      />
      <div className="overflow-x-auto border border-line bg-paper-raised">
        <table className="ledger-table">
          <caption className="sr-only">Example legal entities</caption>
          <thead>
            <tr>
              <th scope="col">Entity</th>
              <th scope="col">Jurisdiction</th>
              <th scope="col">Currency</th>
              <th scope="col">Framework</th>
              <th scope="col">Parent</th>
              <th scope="col" className="num">Accounts</th>
              <th scope="col" className="num">Sources</th>
            </tr>
          </thead>
          <tbody>
            {exampleEntities.map((entity) => (
              <tr key={entity.id}>
                <td>{entity.name}</td>
                <td>{entity.jurisdiction}</td>
                <td>{entity.functionalCurrency}</td>
                <td>{entity.reportingFramework}</td>
                <td>{entity.parentEntityId ? entityName(entity.parentEntityId) : "—"}</td>
                <td className="num">{exampleAccounts.filter((account) => account.entityId === entity.id).length}</td>
                <td className="num">{exampleSources.filter((source) => source.entityId === entity.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-ink-soft">{exampleBooks.organization.name} · origin {exampleBooks.organization.origin}</p>
    </>
  );
}
