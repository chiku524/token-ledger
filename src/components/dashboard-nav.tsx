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
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isHiddenForRole } from "@/data/onboarding-sections";
import type { Role } from "@/auth/roles";

type NavLink = { href: string; label: string; icon: LucideIcon };

type NavGroup = { label: string | null; links: NavLink[] };

const groups: NavGroup[] = [
  {
    label: null,
    links: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Books",
    links: [
      { href: "/dashboard/entities", label: "Companies", icon: Building2 },
      { href: "/dashboard/sources", label: "Holdings", icon: Wallet },
      { href: "/dashboard/ledger", label: "Journal", icon: BookText },
      { href: "/dashboard/approvals", label: "Approvals", icon: ClipboardCheck },
      { href: "/dashboard/reconciliation", label: "Matching", icon: GitCompareArrows },
    ],
  },
  {
    label: "Payments",
    links: [
      { href: "/dashboard/billing", label: "Billing", icon: Receipt },
      { href: "/dashboard/treasury", label: "Treasury", icon: Landmark },
      { href: "/dashboard/payables", label: "Payables", icon: HandCoins },
    ],
  },
  {
    label: "Reporting",
    links: [
      { href: "/dashboard/reports", label: "Reports", icon: ChartColumn },
      { href: "/dashboard/consolidation", label: "Combined", icon: Layers },
    ],
  },
  {
    label: "Workspace",
    links: [
      { href: "/dashboard/operations", label: "Operations", icon: Activity },
      { href: "/dashboard/audit", label: "History", icon: History },
      { href: "/dashboard/guide", label: "Guide", icon: BookOpen },
    ],
  },
];

export function DashboardNav({
  showUsers,
  showOnboarding,
  role,
  hiddenTabs = [],
  onNavigate,
}: {
  showUsers: boolean;
  showOnboarding: boolean;
  role: Role;
  hiddenTabs?: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const pillId = useId();
  const accountLinks: NavLink[] = [
    ...(showUsers ? [{ href: "/dashboard/users", label: "Users", icon: Users }] : []),
    ...(showOnboarding ? [{ href: "/dashboard/onboarding", label: "Onboarding", icon: UserPlus }] : []),
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
  const visible: NavGroup[] = [
    ...groups.map((group) => ({ ...group, links: group.links.filter((link) => !isHiddenForRole(role, link.href, hiddenTabs)) })),
    { label: "Account", links: accountLinks },
  ].filter((group) => group.links.length > 0);

  return (
    <nav aria-label="Sections" className="flex flex-col gap-4">
      {visible.map((group) => (
        <div key={group.label ?? "top"} role="group" aria-label={group.label ?? undefined} className="flex flex-col gap-1">
          {group.label ? <p className="label-caps px-3 pb-1">{group.label}</p> : null}
          {group.links.map(({ href, label, icon: Icon }) => {
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
        </div>
      ))}
    </nav>
  );
}
