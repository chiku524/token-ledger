import { cookies } from "next/headers";
import { ensureCsrf } from "@/auth/current";
import { assistantConfigured } from "@/ai/config";
import { embeddingConfigured } from "@/ai/embeddings/config";
import { speechConfigured } from "@/ai/speech/config";
import { CONNECTION_TOUR_COOKIE } from "@/auth/cookies";
import { can } from "@/auth/roles";
import { shouldShowConnectionTour } from "@/auth/tour";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { loadOnboardingHiddenTabs } from "@/data/onboarding";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, books } = await loadAuthorizedBooks();
  const csrf = await ensureCsrf();
  // The example books have no stored settings, and demo sign-in has no database.
  const hiddenTabs = session.role === "onboarding" && !session.demo
    ? await loadOnboardingHiddenTabs(session.organizationId)
    : [];
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
  const cookieStore = await cookies();
  const dismissed = session.demo && cookieStore.get(CONNECTION_TOUR_COOKIE)?.value === "1";
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const showConnectionTour = shouldShowConnectionTour({
    role: session.role,
    completedAt: session.connectionTourCompletedAt,
    dismissedInBrowser: dismissed,
  });

  return (
    <DashboardShell
      origin={books.organization.origin}
      notice={books.notice}
      subtitle={subtitle}
      session={session}
      csrf={csrf}
      showUsers={can(session.role, "users.manage")}
      showOnboarding={can(session.role, "onboarding.manage")}
      hiddenTabs={hiddenTabs}
      scopeLabel={scopeLabel}
      showConnectionTour={showConnectionTour}
      sidebarOpen={sidebarOpen}
      assistantEnabled={assistantConfigured()}
      assistantMemory={embeddingConfigured()}
      assistantSpeech={speechConfigured()}
      assistantManage={can(session.role, "ai.manage")}
    >
      {children}
    </DashboardShell>
  );
}
