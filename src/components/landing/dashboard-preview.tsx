import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  FileText,
  LayoutDashboard,
  Link2,
  Settings2,
  Wallet,
} from "lucide-react";
import { exampleHref } from "@/components/landing/content";
import { JournalCard } from "@/components/landing/journal-card";
import { activities, money, sources, totalAccounts, totalAssets } from "@/components/landing/sample-data";
import { LogoMark } from "@/components/logo";
import { NumberTicker } from "@/components/motion/number-ticker";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const sidebar = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: Wallet, label: "Activity" },
  { icon: Link2, label: "Accounts" },
  { icon: FileText, label: "Reports" },
  { icon: Building2, label: "Entities" },
];

function Balances() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
        <span>Source</span>
        <span>Amount (USD)</span>
      </div>
      <div className="space-y-4">
        {sources.map((source) => (
          <div key={source.name} className="flex items-center justify-between gap-3 text-[11px] sm:text-xs">
            <span className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full ring-1 ring-border", source.color)} />
              {source.name}
            </span>
            <span className="font-mono tabular-nums">{money(source.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Activity() {
  return (
    <div className="space-y-4">
      {activities.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-3 text-[10px] sm:text-[11px]">
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {item.amount > 0 ? (
                <ArrowDownLeft className="size-3" aria-hidden />
              ) : (
                <ArrowUpRight className="size-3" aria-hidden />
              )}
            </span>
            {item.name}
          </span>
          <span className={cn("whitespace-nowrap font-mono tabular-nums", item.amount > 0 && "text-success")}>
            {item.amount > 0 ? "+" : "−"}
            {money(Math.abs(item.amount), 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div className="relative isolate mx-auto w-full max-w-[710px] pb-4 pt-7 lg:pt-9">
      <div
        aria-hidden
        className="preview-slab absolute inset-y-0 left-[9%] right-[-1%] -z-10 rounded-[22px] bg-brand sm:rotate-1"
      />
      <Card className="preview-card relative gap-0 overflow-hidden rounded-xl bg-background p-0 shadow-2xl sm:-rotate-1">
        <div className="flex">
          <aside
            aria-label="Illustrative dashboard sidebar"
            className="hidden w-[112px] shrink-0 flex-col border-r border-border p-3 sm:flex"
          >
            <LogoMark className="mb-6 size-6" />
            <div className="space-y-2 text-[9px] text-muted-foreground">
              {sidebar.map(({ icon: Icon, label }, i) => (
                <div
                  key={label}
                  className={cn("flex items-center gap-2 rounded-md px-2 py-2", i === 0 && "bg-muted text-foreground")}
                >
                  <Icon className="size-3" aria-hidden />
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-2 px-2 pb-4 pt-6 text-[9px] text-muted-foreground">
              <Settings2 className="size-3" aria-hidden />
              Settings
            </div>
          </aside>
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight sm:text-base">Harbourline Digital</h2>
            </div>
            <div className="preview-tiles mb-4 grid grid-cols-[1.7fr_1fr_1fr] gap-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[9px] text-muted-foreground">Total asset value</p>
                <p className="mt-2 font-heading text-sm font-semibold tracking-tight sm:text-lg">
                  USD <NumberTicker value={totalAssets} duration={1.1} className="[font-family:inherit]" />
                </p>
                <div
                  role="img"
                  aria-label="Wallets 53.3%, exchanges 35%, custodians 11.7%"
                  className="mt-4 flex h-2.5 overflow-hidden rounded-sm"
                >
                  {sources.map((source) => (
                    <span
                      key={source.name}
                      className={source.color}
                      style={{
                        width: `${(source.amount / totalAssets) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[9px] text-muted-foreground">Accounts</p>
                <p className="mt-2 font-heading text-xl font-semibold">
                  <NumberTicker value={totalAccounts} duration={0.9} className="[font-family:inherit]" />
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Across all sources</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[9px] text-muted-foreground">Entities</p>
                <p className="mt-2 font-heading text-xl font-semibold">
                  <NumberTicker value={3} duration={0.9} className="[font-family:inherit]" />
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Group companies</p>
              </div>
            </div>
            <div className="grid gap-3 min-[440px]:grid-cols-2">
              <div className="rounded-lg border bg-card p-3">
                <h3 className="mb-4 text-[11px] font-semibold">Balances by source</h3>
                <Balances />
              </div>
              <div className="hidden rounded-lg border bg-card p-3 min-[440px]:block">
                <h3 className="mb-4 text-[11px] font-semibold">Recent activity</h3>
                <Activity />
              </div>
            </div>
            <Link
              href={exampleHref}
              className="mt-3 ml-auto flex w-fit items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Go to app <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </div>
        </div>
      </Card>
      <JournalCard className="preview-journal relative mx-auto -mt-1 w-[90%] rotate-1 sm:-mt-2 sm:ml-[17%] sm:w-[77%]" />
    </div>
  );
}
