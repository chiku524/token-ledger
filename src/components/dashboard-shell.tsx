import { TriangleAlert } from "lucide-react";
import { resendVerificationAction } from "@/app/dashboard/user-actions";
import type { SessionUser } from "@/auth/current";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./app-sidebar";
import { ChatPanel } from "./chat/chat-panel";
import { ConnectionTour } from "./connection-tour";
import { DashboardHeader } from "./dashboard-header";
import { ExampleBanner } from "./example-banner";

export function DashboardShell({
  children,
  origin,
  notice,
  subtitle,
  session,
  csrf,
  showUsers,
  showOnboarding,
  showPlatform,
  hiddenTabs,
  scopeLabel,
  showConnectionTour,
  sidebarOpen,
  assistantEnabled,
  assistantMemory,
  assistantSpeech,
  assistantManage,
}: {
  children: React.ReactNode;
  origin: "example" | "live";
  notice: string;
  subtitle: string;
  session: SessionUser;
  csrf: string;
  showUsers: boolean;
  showOnboarding: boolean;
  /** Whether this session is a platform admin (cross-organization panel). */
  showPlatform: boolean;
  hiddenTabs: readonly string[];
  scopeLabel: string | null;
  showConnectionTour: boolean;
  sidebarOpen: boolean;
  /** Whether a provider is configured; the launcher explains it is off otherwise. */
  assistantEnabled: boolean;
  /** Whether retrieval (RAG) is on for this deployment. */
  assistantMemory: boolean;
  /** Whether text-to-speech (ElevenLabs) is on for this deployment. */
  assistantSpeech: boolean;
  /** Whether this session may switch provider/model (owner or admin). */
  assistantManage: boolean;
}) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen} data-print="shell">
        <a
          href="#content"
          data-print="hide"
          className="fixed top-3 left-3 z-50 -translate-y-20 rounded-lg bg-primary px-3 py-1.5 text-primary-foreground transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        <AppSidebar
          subtitle={subtitle}
          session={session}
          csrf={csrf}
          scopeLabel={scopeLabel}
          showUsers={showUsers}
          showOnboarding={showOnboarding}
          showPlatform={showPlatform}
          role={session.role}
          hiddenTabs={hiddenTabs}
        />
        <SidebarInset className="min-w-0">
          <DashboardHeader showUsers={showUsers} showOnboarding={showOnboarding} showPlatform={showPlatform} role={session.role} hiddenTabs={hiddenTabs} />
          <ExampleBanner origin={origin} notice={notice} />
          {!session.emailVerified && !session.demo ? (
            <div className="dashboard-width px-4 pt-4 md:px-8">
              <Alert variant="warning" className="max-w-3xl">
                <TriangleAlert aria-hidden />
                <AlertDescription>
                  <span>Confirm your email address. Check your inbox for the confirmation link.</span>
                  <form action={resendVerificationAction} className="mt-2">
                    <input type="hidden" name="csrf" value={csrf} />
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Sending…">
                      Resend confirmation email
                    </SubmitButton>
                  </form>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
          <main id="content" className="dashboard-width px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
          {showConnectionTour ? <ConnectionTour csrf={csrf} /> : null}
        </SidebarInset>
        <ChatPanel csrf={csrf} enabled={assistantEnabled} memory={assistantMemory} speech={assistantSpeech} canManageAi={assistantManage} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
