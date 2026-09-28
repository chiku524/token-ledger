import Link from "next/link";
import { DashboardNav } from "./dashboard-nav";
import { ExampleBanner } from "./example-banner";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="border-b border-line md:min-h-screen md:border-r md:border-b-0">
        <div className="flex items-baseline justify-between px-4 py-4 md:block">
          <Link href="/" className="font-serif text-xl tracking-tight">
            Token Ledger
          </Link>
          <p className="text-xs tracking-wide text-ink-soft md:mt-1">Example books</p>
        </div>
        <div className="px-3 pb-3">
          <DashboardNav />
        </div>
      </aside>
      <div className="min-w-0">
        <ExampleBanner />
        <div className="px-4 py-6 md:px-8 md:py-8">{children}</div>
      </div>
    </div>
  );
}
