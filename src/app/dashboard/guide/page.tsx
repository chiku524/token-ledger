import { cookies } from "next/headers";
import { ensureCsrf } from "@/auth/current";
import { CONNECTION_TOUR_COOKIE } from "@/auth/cookies";
import { shouldShowConnectionTour } from "@/auth/tour";
import { ConnectionGuide } from "@/components/connection-guide";
import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";

export const metadata = { title: "Guide" };

export default async function GuidePage() {
  const { session } = await loadAuthorizedBooks();
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
        kicker="How a connection works"
        title="Guide"
        description="Read-only access for a wallet, an exchange, or a custodian. Observations stay beside the journal until someone posts them."
      />
      <ConnectionGuide csrf={csrf} canRestartTour={session.role === "admin" && !tourPending} />
    </>
  );
}
