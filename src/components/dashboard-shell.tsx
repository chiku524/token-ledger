import Link from "next/link";
import { signOutAction } from "@/app/sign-in/actions";
import type { SessionUser } from "@/auth/current";
import { roleLabel } from "@/auth/roles";
import { ThemeToggle } from "./theme-toggle";
import { DashboardNav } from "./dashboard-nav";
import { ConnectionTour } from "./connection-tour";
import { ExampleBanner } from "./example-banner";

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
    <div className="min-h-full md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <aside className="border-b border-line md:min-h-screen md:border-r md:border-b-0">
        <div className="flex items-baseline justify-between gap-3 px-4 py-4 md:block">
          <Link href="/" className="font-serif text-xl tracking-tight">
            Token Ledger
          </Link>
          <p className="text-xs tracking-wide text-ink-soft md:mt-1">{subtitle}</p>
          <div className="md:mt-3">
            <ThemeToggle />
          </div>
        </div>
        <div className="px-3 pb-3">
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
        <main id="content" className="px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
        {showConnectionTour ? <ConnectionTour csrf={csrf} /> : null}
      </div>
    </div>
  );
}
