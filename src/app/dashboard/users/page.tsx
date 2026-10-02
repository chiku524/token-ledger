import { SubmitButton } from "@/components/submit-button";
import { headers } from "next/headers";
import { changeAccessAction, deactivateUserAction, inviteUserAction } from "@/app/dashboard/user-actions";
import { ensureCsrf } from "@/auth/current";
import { EXAMPLE_USERS } from "@/auth/example-users";
import { can, canAssignRole, canDeactivate, removesLastOwner, roleLabel, ROLES } from "@/auth/roles";
import { Flash } from "@/components/flash";
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
        <p className="panel px-4 py-6 text-sm text-ink-soft">
          You do not have permission to manage users.
        </p>
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
        description="Invite someone, change what they can do, or turn off an account. The invite link is shown here once. It is not emailed."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      {inviteLink ? (
        <p role="status" className="mb-6 border border-pine/40 bg-paper-raised px-4 py-3 text-sm text-pine">
          {emailed
            ? `Invite emailed to ${invite?.email}. You can also share the link below.`
            : `Invite link for ${invite?.email}. ${emailConfigured ? "The email could not be sent." : "Email is not configured, so it is shown here."} Copy it now.`}{" "}
          It expires in 7 days.
          <span className="mt-2 block font-mono text-xs break-all text-ink">{inviteLink}</span>
        </p>
      ) : null}
      {session.demo ? (
        <p className="mb-6 text-sm leading-relaxed text-ink-soft">
          This demo lists the sample Harbourline staff and shows the invite form. Adding a person needs a database.
        </p>
      ) : null}
      <form action={inviteUserAction} className="mb-10 grid gap-3 panel p-4 md:grid-cols-2">
        <h2 className="text-lg font-semibold tracking-tight md:col-span-2">Invite someone</h2>
        <input type="hidden" name="csrf" value={csrf} />
        <label className="field">
          <span>Name</span>
          <input name="name" required maxLength={80} autoComplete="name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required maxLength={200} autoComplete="off" />
        </label>
        <label className="field">
          <span>Role</span>
          <select name="role" defaultValue={assignable.includes("accountant") ? "accountant" : assignable[0]}>
            {assignable.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Companies</span>
          <input name="entityScope" placeholder="Blank for every company" list="entity-ids" />
        </label>
        <datalist id="entity-ids">
          {books.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </datalist>
        <p className="text-sm text-ink-soft md:col-span-2">
          Leave this blank for every company. A comma-separated list limits an accountant or viewer to those companies. Owners and admins always see every company.
        </p>
        <div className="md:col-span-2">
          <SubmitButton>
            Create invite link
          </SubmitButton>
        </div>
      </form>
      <div className="overflow-x-auto panel">
        <table className="ledger-table">
          <caption className="sr-only">Organization users</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
                <th scope="col">Companies</th>
              <th scope="col">Access</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const lastOwner = removesLastOwner(owners, person.id, "inactive");
              const roleChoices = ROLES.filter((role) => canAssignRole(session, role, person) || role === person.role);
              return (
                <tr key={person.id}>
                  <td>
                    {person.name}
                    <span className="mt-1 block text-xs text-ink-soft">{person.email}</span>
                  </td>
                  <td>{roleLabel(person.role)}</td>
                  <td className="capitalize">{person.status}</td>
                  <td>{person.entityScope.length === 0 ? "All companies" : person.entityScope.join(", ")}</td>
                  <td>
                    {database && person.status !== "inactive" ? (
                      <div className="grid gap-2">
                        <form action={changeAccessAction} className="grid gap-2">
                          <input type="hidden" name="csrf" value={csrf} />
                          <input type="hidden" name="userId" value={person.id} />
                          <label className="sr-only" htmlFor={`role-${person.id}`}>
                            Role for {person.name}
                          </label>
                          <select id={`role-${person.id}`} name="role" defaultValue={person.role}>
                            {roleChoices.map((role) => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ))}
                          </select>
                          <label className="sr-only" htmlFor={`scope-${person.id}`}>
                            Companies for {person.name}
                          </label>
                          <input id={`scope-${person.id}`} name="entityScope" defaultValue={person.entityScope.join(", ")} placeholder="All companies" />
                          <SubmitButton variant="secondary">
                            Save access
                          </SubmitButton>
                        </form>
                        {canDeactivate(session, person) && !lastOwner ? (
                          <form action={deactivateUserAction}>
                            <input type="hidden" name="csrf" value={csrf} />
                            <input type="hidden" name="userId" value={person.id} />
                            <SubmitButton variant="secondary">
                              Deactivate
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-soft">{database ? "Turned off" : "Sample only"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
