import { cookies } from "next/headers";
import { ensureCsrf } from "@/auth/current";
import { CONNECTION_TOUR_COOKIE } from "@/auth/cookies";
import { shouldShowConnectionTour } from "@/auth/tour";
import { AiChatbotGuide } from "@/components/ai-chatbot-guide";
import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { requireSectionAccess } from "@/data/section-access";

export const metadata = { title: "Guide" };

export default async function GuidePage() {
  const { session } = await loadAuthorizedBooks();
  await requireSectionAccess("/dashboard/guide");
  const csrf = await ensureCsrf();
  const dismissed = session.demo && (await cookies()).get(CONNECTION_TOUR_COOKIE)?.value === "1";
  const tourPending = shouldShowConnectionTour({
    role: session.role,
    completedAt: session.connectionTourCompletedAt,
    dismissedInBrowser: dismissed,
  });

  return (
    <>
      <PageHeader
        kicker="AI chatbot handbook"
        title="Guide"
        description="Ask for reports, matching, connections, and more — the assistant can do anything you can, under your role. Observations stay observed; journals stay deliberate."
      />
      <AiChatbotGuide csrf={csrf} canRestartTour={session.role === "admin" && !tourPending} />
    </>
  );
}
