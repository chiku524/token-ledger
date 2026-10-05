import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { resendVerificationAction } from "@/app/dashboard/user-actions";
import type { SessionUser } from "@/auth/current";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GettingStartedProgress } from "@/data/getting-started";
import { ConnectionTour } from "./connection-tour";
import { DashboardNav } from "./dashboard-nav";
import { ExampleBanner } from "./example-banner";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function DashboardShell({
  children,
  origin,
  notice,
  subtitle,
  session,
  csrf,
  showUsers,
  scopeLabel,
  showConnectionTour,
  tourProgress,
}: {
  children: React.ReactNode;
  origin: "example" | "live";
  notice: string;
  subtitle: string;
  session: SessionUser;
  csrf: string;
  showUsers: boolean;
  scopeLabel: string | null;
  showConnectionTour: boolean;
  tourProgress: GettingStartedProgress;
}) {
  const userMenu = <UserMenu session={session} csrf={csrf} scopeLabel={scopeLabel} />;

  return (
    <div data-print="shell" className="min-h-full bg-background md:grid md:grid-cols-[16.75rem_minmax(0,1fr)]">
      <a
        href="#content"
        data-print="hide"
        className="fixed top-3 left-3 z-50 -translate-y-20 rounded-lg bg-primary px-3 py-1.5 text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
        <div className="min-w-0">
          <Link href="/">
            <Logo size="sm" />
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <MobileNav showUsers={showUsers} footer={userMenu} />
        </div>
      </header>
      <aside className="hidden flex-col border-r border-border bg-card md:sticky md:top-0 md:flex md:h-screen">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <ThemeToggle />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <DashboardNav showUsers={showUsers} />
        </div>
        <div className="border-t border-border p-3">{userMenu}</div>
      </aside>
      <div className="min-w-0">
        <ExampleBanner origin={origin} notice={notice} />
        {!session.emailVerified && !session.demo ? (
          <Alert variant="warning" className="mx-4 mt-4 max-w-3xl md:mx-8">
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
        ) : null}
        <main id="content" className="px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
        {showConnectionTour ? <ConnectionTour csrf={csrf} progress={tourProgress} /> : null}
      </div>
    </div>
  );
}
