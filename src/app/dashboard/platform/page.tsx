import { Building2 } from "lucide-react";
import { requirePlatformAdmin } from "@/auth/current";
import { ensureCsrf } from "@/auth/current";
import { deactivatePlatformUserAction, reactivatePlatformUserAction } from "@/app/dashboard/platform-actions";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { TableCard } from "@/components/app/table-card";
import { EmptyRow } from "@/components/app/table-cells";
import { Stagger } from "@/components/motion/stagger";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { listPlatformOrgs, listPlatformUsers, platformTotals } from "@/db/platform";
import { one } from "@/data/query";
import { hasDatabase } from "@/db/availability";

export const metadata = { title: "Platform" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * The platform-admin panel: every organization and every user across the whole
 * system, so an operator can see who has signed up, which organization they are
 * in, and how many users each organization holds. Reachable only by an email on
 * `PLATFORM_ADMIN_EMAILS`; an organization owner/admin does not qualify.
 */
export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; error?: string | string[]; saved?: string | string[] }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const query = (one(params.q) ?? "").trim().toLowerCase();

  if (!hasDatabase()) {
    return (
      <>
        <PageHeader kicker="Operations" title="Platform" description="Every organization and user across the system." />
        <EmptyState>The platform panel needs a database.</EmptyState>
      </>
    );
  }

  const [totals, orgs, allUsers] = await Promise.all([platformTotals(), listPlatformOrgs(), listPlatformUsers()]);
  const csrf = await ensureCsrf();
  const users = query
    ? allUsers.filter((user) => `${user.email} ${user.name} ${user.organizationName}`.toLowerCase().includes(query))
    : allUsers;
  const shownOrgs = query ? orgs.filter((org) => org.name.toLowerCase().includes(query) || org.id.includes(query)) : orgs;

  return (
    <>
      <PageHeader
        kicker="Operations"
        title="Platform"
        description="Every organization and every user across the whole system. This view crosses organization boundaries and is gated to platform admins."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />

      <Stagger className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Organizations" value={totals.organizations} />
        <StatCard label="Users" value={totals.users} />
        <StatCard label="Active users" value={allUsers.filter((user) => user.status === "active").length} />
        <StatCard label="Signed in at least once" value={allUsers.filter((user) => user.lastSignedInAt).length} />
      </Stagger>

      <form method="get" className="mb-6 flex max-w-md items-center gap-2">
        <Input name="q" defaultValue={one(params.q) ?? ""} placeholder="Search by name, email, or organization" aria-label="Search" />
        <SubmitButton variant="secondary">Search</SubmitButton>
      </form>

      <section className="mb-12">
        <SectionHeader title="Organizations" />
        <TableCard>
          <Table>
            <caption className="sr-only">All organizations</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Companies</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shownOrgs.length === 0 ? <EmptyRow colSpan={6}>No organizations match.</EmptyRow> : null}
              {shownOrgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
                      {org.name}
                    </span>
                    <span className="mt-1 block font-mono text-xs text-muted-foreground">{org.id}</span>
                  </TableCell>
                  <TableCell className="capitalize">{org.origin}</TableCell>
                  <TableCell>{org.userCount}</TableCell>
                  <TableCell>{org.entityCount}</TableCell>
                  <TableCell className="text-xs">{org.ownerEmails.join(", ") || "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(org.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section>
        <SectionHeader title={`All users (${users.length})`} />
        <TableCard>
          <Table>
            <caption className="sr-only">All users across every organization</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? <EmptyRow colSpan={8}>No users match.</EmptyRow> : null}
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    {user.name}
                    <span className="mt-1 block text-xs text-muted-foreground">{user.email}</span>
                  </TableCell>
                  <TableCell className="text-xs">{user.organizationName}</TableCell>
                  <TableCell className="capitalize">{user.role}</TableCell>
                  <TableCell>
                    <StatusBadge tone={user.status === "active" ? "success" : "neutral"} className="capitalize">
                      {user.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs">{user.emailVerified ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-xs">{formatDate(user.lastSignedInAt)}</TableCell>
                  <TableCell className="text-xs">{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <form action={user.status === "active" ? deactivatePlatformUserAction : reactivatePlatformUserAction}>
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="userId" value={user.id} />
                      <SubmitButton variant="secondary" size="sm">
                        {user.status === "active" ? "Deactivate" : "Reactivate"}
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>
    </>
  );
}
