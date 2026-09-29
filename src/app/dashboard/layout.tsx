import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, books } = await loadAuthorizedBooks();
  const csrf = await ensureCsrf();
  const subtitle = session.demo
    ? "Demo"
    : books.organization.origin === "live"
      ? "Saved"
      : booksAreWritable()
        ? "Sample, saved"
        : "Sample";
  const scopeLabel =
    session.entityScope.length > 0
      ? `Limited to ${books.entities.map((entity) => entity.name).join(", ") || "no companies"}`
      : null;

  return (
    <DashboardShell
      origin={books.organization.origin}
      notice={books.notice}
      subtitle={subtitle}
      session={session}
      csrf={csrf}
      showUsers={can(session.role, "users.manage")}
      scopeLabel={scopeLabel}
    >
      {children}
    </DashboardShell>
  );
}
