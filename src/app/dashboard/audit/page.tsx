import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { can } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { NumberCell } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { auditSubjectTypes, filterAuditEvents, parseAuditFilter } from "@/data/audit-filter";
import { actionLabel, subjectLabel } from "@/data/present";

export const metadata = { title: "History" };

function queryString(filter: { actor: string; action: string; subjectType: string; from: string; to: string }): string {
  const params = new URLSearchParams();
  if (filter.actor) params.set("actor", filter.actor);
  if (filter.action) params.set("action", filter.action);
  if (filter.subjectType) params.set("subjectType", filter.subjectType);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  return params.toString();
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const filter = parseAuditFilter(params);
  const events = filterAuditEvents(books.auditEvents, filter);
  const subjectTypes = auditSubjectTypes(books.auditEvents);
  const exportQuery = queryString(filter);
  const canExport = can(session.role, "books.export");

  return (
    <>
      <PageHeader
        kicker="Who did what"
        title="History"
        description="New companies, wallets and accounts, imports, posted entries, sign-ins, and user changes are listed here. Entries are not edited. Filter by name, action, subject, or dates, then download the result."
      />
      <FormCard className="mb-6 md:grid-cols-5" method="get">
        <Field label="Name">
          <Input name="actor" defaultValue={filter.actor} placeholder="Who" />
        </Field>
        <Field label="Action">
          <Input name="action" defaultValue={filter.action} placeholder="journal.posted" />
        </Field>
        <Field label="Subject">
          <NativeSelect name="subjectType" defaultValue={filter.subjectType}>
            <NativeSelectOption value="">Any</NativeSelectOption>
            {subjectTypes.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {subjectLabel(type)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="From">
          <Input name="from" type="date" defaultValue={filter.from} />
        </Field>
        <Field label="To">
          <Input name="to" type="date" defaultValue={filter.to} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 md:col-span-5">
          <SubmitButton>Filter</SubmitButton>
          <Link href="/dashboard/audit" className="text-sm text-link underline">
            Clear
          </Link>
          {canExport ? (
            <Button asChild variant="secondary">
              <a href={`/dashboard/audit/export${exportQuery ? `?${exportQuery}` : ""}`}>Download CSV</a>
            </Button>
          ) : null}
        </div>
      </FormCard>

      {events.length === 0 ? (
        <EmptyState>Nothing matches these filters.</EmptyState>
      ) : (
        <TableCard className="mt-0">
          <Table>
            <caption className="sr-only">History</caption>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>What happened</TableHead>
                <TableHead>About</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <NumberCell align="left">{event.occurredAt.slice(0, 16).replace("T", " ")}</NumberCell>
                  <TableCell>{event.actor}</TableCell>
                  <TableCell className="min-w-40">{actionLabel(event.action)}</TableCell>
                  <TableCell>
                    {subjectLabel(event.subjectType)}
                    <span className="mt-1 block text-xs text-muted-foreground">{event.subjectId}</span>
                  </TableCell>
                  <TableCell className="min-w-56">{event.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}
