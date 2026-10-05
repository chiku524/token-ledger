import { cookies } from "next/headers";
import { ensureCsrf } from "@/auth/current";
import { CONNECTION_TOUR_COOKIE } from "@/auth/cookies";
import { can } from "@/auth/roles";
import { shouldShowConnectionTour } from "@/auth/tour";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import type { GettingStartedProgress } from "@/data/getting-started";
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
  const dismissed = session.demo && (await cookies()).get(CONNECTION_TOUR_COOKIE)?.value === "1";
  const showConnectionTour = shouldShowConnectionTour({
    role: session.role,
    completedAt: session.connectionTourCompletedAt,
    dismissedInBrowser: dismissed,
  });
  const tourProgress: GettingStartedProgress = {
    connections: books.connections.map((connection) => ({
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
    })),
    observedBalanceCount: books.balanceSnapshots.length,
  };

  return (
    <DashboardShell
      origin={books.organization.origin}
      notice={books.notice}
      subtitle={subtitle}
      session={session}
      csrf={csrf}
      showUsers={can(session.role, "users.manage")}
      scopeLabel={scopeLabel}
      showConnectionTour={showConnectionTour}
      tourProgress={tourProgress}
    >
      {children}
    </DashboardShell>
  );
}
