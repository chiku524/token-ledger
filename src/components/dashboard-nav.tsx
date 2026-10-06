"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { m } from "motion/react";
import {
  Activity,
  BookOpen,
  BookText,
  Building2,
  ChartColumn,
  ClipboardCheck,
  GitCompareArrows,
  HandCoins,
  History,
  Layers,
  LayoutDashboard,
  Landmark,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon };

const links: NavLink[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/entities", label: "Companies", icon: Building2 },
  { href: "/dashboard/sources", label: "Holdings", icon: Wallet },
  { href: "/dashboard/guide", label: "Guide", icon: BookOpen },
  { href: "/dashboard/ledger", label: "Journal", icon: BookText },
  { href: "/dashboard/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/dashboard/reconciliation", label: "Matching", icon: GitCompareArrows },
  { href: "/dashboard/billing", label: "Billing", icon: Receipt },
  { href: "/dashboard/treasury", label: "Treasury", icon: Landmark },
  { href: "/dashboard/payables", label: "Payables", icon: HandCoins },
  { href: "/dashboard/reports", label: "Reports", icon: ChartColumn },
  { href: "/dashboard/consolidation", label: "Combined", icon: Layers },
  { href: "/dashboard/operations", label: "Operations", icon: Activity },
  { href: "/dashboard/audit", label: "History", icon: History },
];

export function DashboardNav({ showUsers, onNavigate }: { showUsers: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const pillId = useId();
  const items: NavLink[] = [
    ...links,
    ...(showUsers ? [{ href: "/dashboard/users", label: "Users", icon: Users }] : []),
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav aria-label="Sections" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active ? "font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {active ? (
              <m.span
                layoutId={pillId}
                className="absolute inset-0 rounded-lg bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            <Icon className="relative size-4 shrink-0" aria-hidden />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
