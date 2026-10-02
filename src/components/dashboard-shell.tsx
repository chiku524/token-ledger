import Link from "next/link";
import { signOutAction } from "@/app/sign-in/actions";
import type { SessionUser } from "@/auth/current";
import { roleLabel } from "@/auth/roles";
import { ThemeToggle } from "./theme-toggle";
import { DashboardNav } from "./dashboard-nav";
import { ConnectionTour } from "./connection-tour";
import { ExampleBanner } from "./example-banner";
import { Wordmark } from "./wordmark";

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
}) {
  return (
    <div className="min-h-full bg-paper md:grid md:grid-cols-[16.75rem_minmax(0,1fr)]">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <aside className="flex flex-col border-b border-line bg-paper-raised md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 md:block">
          <Link href="/">
            <Wordmark />
          </Link>
          <p className="text-xs text-ink-soft md:mt-1">{subtitle}</p>
          <div className="md:mt-3">
            <ThemeToggle />
          </div>
        </div>
        <div className="px-3 pb-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
          <DashboardNav showUsers={showUsers} />
        </div>
        <div className="border-t border-line px-4 py-4 text-sm">
          <p className="font-medium">{session.name}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {roleLabel(session.role)} · {session.email}
          </p>
          {session.demo ? <p className="mt-1 text-xs text-seal">Sample preview · not saved</p> : null}
          {scopeLabel ? <p className="mt-1 text-xs text-ink-soft">{scopeLabel}</p> : null}
          <form action={signOutAction} className="mt-3">
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <ExampleBanner origin={origin} notice={notice} />
        {!session.emailVerified && !session.demo ? (
          <p role="alert" className="mx-4 mt-4 max-w-3xl rounded-xl border border-seal/30 bg-paper-raised px-4 py-3 text-sm text-seal md:mx-8">
            Confirm your email address. Check your inbox for the confirmation link; if it is missing, an owner can resend it.
          </p>
        ) : null}
        <main id="content" className="px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
        {showConnectionTour ? <ConnectionTour csrf={csrf} /> : null}
      </div>
    </div>
  );
}
