import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { EntityForm, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { entityName } from "@/data/present";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSectionAccess } from "@/data/section-access";

export const metadata = { title: "Companies" };

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  await requireSectionAccess("/dashboard/entities");
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
        <EmptyState>No companies yet.</EmptyState>
      ) : (
        <TableCard className="mt-0">
          <Table>
            <caption className="sr-only">Companies</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Company</TableHead>
                <TableHead scope="col">Country</TableHead>
                <TableHead scope="col">Currency</TableHead>
                <TableHead scope="col">Standard</TableHead>
                <TableHead scope="col">Parent</TableHead>
                <NumberHead scope="col">Accounts</NumberHead>
                <NumberHead scope="col">Places</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.entities.map((entity) => (
                <TableRow key={entity.id}>
                  <TableCell>{entity.name}</TableCell>
                  <TableCell>{entity.jurisdiction}</TableCell>
                  <TableCell>{entity.functionalCurrency}</TableCell>
                  <TableCell>{entity.reportingFramework}</TableCell>
                  <TableCell>{entity.parentEntityId ? entityName(entity.parentEntityId, books.entities) : "—"}</TableCell>
                  <NumberCell>{books.accounts.filter((account) => account.entityId === entity.id).length}</NumberCell>
                  <NumberCell>{books.sources.filter((source) => source.entityId === entity.id).length}</NumberCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        {books.organization.name} · {books.organization.origin === "live" ? "Live" : "Example"}
      </p>
    </>
  );
}
