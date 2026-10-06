import { SubmitButton } from "@/components/submit-button";
import { headers } from "next/headers";
import { changeAccessAction, deactivateUserAction, inviteUserAction } from "@/app/dashboard/user-actions";
import { ensureCsrf } from "@/auth/current";
import { EXAMPLE_USERS } from "@/auth/example-users";
import { can, canAssignRole, canDeactivate, removesLastOwner, roleLabel, ROLES } from "@/auth/roles";
import { EmptyState } from "@/components/app/empty-state";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { StatusBadge } from "@/components/app/status-badge";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { one } from "@/data/query";
import { activeOwnerIds, findInvite, listOrganizationUsers } from "@/db/auth-store";
import { absoluteLink } from "@/email/links";
import { hasDatabase } from "@/db/availability";
import { readEmailFrom, readResendApiKey } from "@/env";

export const metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[]; issued?: string | string[]; emailed?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const allowed = can(session.role, "users.manage");
  if (!allowed) {
    return (
      <>
        <PageHeader
          kicker="Access"
          title="Users"
          description="Owners and admins decide who can sign in. You can view the books and download CSVs."
        />
        <EmptyState>You do not have permission to manage users.</EmptyState>
      </>
    );
  }

  const csrf = await ensureCsrf();
  const database = hasDatabase() && !session.demo;
  const people = database
    ? await listOrganizationUsers(session.organizationId)
    : EXAMPLE_USERS.map(({ email, name, role, entityScope }) => ({
        id: email,
        email,
        name,
        role,
        status: "active" as const,
        entityScope: [...entityScope],
        organizationId: session.organizationId,
        passwordHash: null,
      }));
  const owners = database ? await activeOwnerIds(session.organizationId) : people.filter((person) => person.role === "owner" && person.status === "active").map((person) => person.id);
  const issued = one(params.issued);
  const emailed = one(params.emailed) === "1";
  const invite = issued && database ? await findInvite(issued) : null;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto");
  const inviteLink = invite && issued ? absoluteLink(`/sign-in?invite=${issued}`, host, proto) : null;
  const emailConfigured = Boolean(readResendApiKey() && readEmailFrom());
  const assignable = ROLES.filter((role) => canAssignRole(session, role, null));

  return (
    <>
      <PageHeader
        kicker={books.organization.name}
        title="Users"
        description="Invite someone, change what they can do, or turn off an account. Admins can grant the admin role; only an owner can make or remove an owner. The invite is emailed when email is configured, and the link is shown here once."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      {inviteLink ? (
        <Alert variant="success" role="status" className="mb-6">
          {emailed
            ? `Invite emailed to ${invite?.email}. You can also share the link below.`
            : `Invite link for ${invite?.email}. ${emailConfigured ? "The email could not be sent." : "Email is not configured, so it is shown here."} Copy it now.`}{" "}
          It expires in 7 days.
          <span className="mt-2 block font-mono text-xs break-all text-foreground">{inviteLink}</span>
        </Alert>
      ) : null}
      {session.demo ? (
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          This demo lists the sample Harbourline staff and shows the invite form. Adding a person needs a database.
        </p>
      ) : null}
      <FormCard action={inviteUserAction} title="Invite someone" className="mb-10 md:grid-cols-2">
        <input type="hidden" name="csrf" value={csrf} />
        <Field label="Name">
          <Input name="name" required maxLength={80} autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required maxLength={200} autoComplete="off" />
        </Field>
        <Field label="Role">
          <NativeSelect name="role" defaultValue={assignable.includes("accountant") ? "accountant" : assignable[0]}>
            {assignable.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {roleLabel(role)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Companies">
          <Input name="entityScope" placeholder="Blank for every company" list="entity-ids" />
        </Field>
        <datalist id="entity-ids">
          {books.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </datalist>
        <p className="text-sm text-muted-foreground md:col-span-2">
          Leave this blank for every company. A comma-separated list limits an accountant or viewer to those companies. Owners and admins always see every company.
        </p>
        <div className="md:col-span-2">
          <SubmitButton>Create invite link</SubmitButton>
        </div>
      </FormCard>
      <TableCard className="mt-0">
        <Table>
          <caption className="sr-only">Organization users</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Companies</TableHead>
              <TableHead>Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => {
              const lastOwner = removesLastOwner(owners, person.id, "inactive");
              const roleChoices = ROLES.filter((role) => canAssignRole(session, role, person) || role === person.role);
              return (
                <TableRow key={person.id}>
                  <TableCell>
                    {person.name}
                    <span className="mt-1 block text-xs text-muted-foreground">{person.email}</span>
                  </TableCell>
                  <TableCell>{roleLabel(person.role)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={person.status === "active" ? "success" : "neutral"} className="capitalize">
                      {person.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{person.entityScope.length === 0 ? "All companies" : person.entityScope.join(", ")}</TableCell>
                  <TableCell>
                    {database && person.status !== "inactive" ? (
                      <div className="grid gap-2">
                        <form action={changeAccessAction} className="grid gap-2">
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="userId" value={person.id} />
                          <label className="sr-only" htmlFor={`role-${person.id}`}>
                            Role for {person.name}
                          </label>
                          <NativeSelect id={`role-${person.id}`} name="role" defaultValue={person.role}>
                            {roleChoices.map((role) => (
                              <NativeSelectOption key={role} value={role}>
                                {roleLabel(role)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <label className="sr-only" htmlFor={`scope-${person.id}`}>
                            Companies for {person.name}
                          </label>
                          <Input id={`scope-${person.id}`} name="entityScope" defaultValue={person.entityScope.join(", ")} placeholder="All companies" />
                          <SubmitButton variant="secondary">Save access</SubmitButton>
                        </form>
                        {canDeactivate(session, person) && !lastOwner ? (
                          <form action={deactivateUserAction}>
                            <input type="hidden" name="csrf" value={csrf} />
                            <input type="hidden" name="userId" value={person.id} />
                            <SubmitButton variant="secondary">Deactivate</SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{database ? "Turned off" : "Sample only"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </>
  );
}
