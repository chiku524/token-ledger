"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { m } from "motion/react";
import {
  Activity,
  BookOpen,
  BookText,
  Building2,
  ChartColumn,
  ChevronRight,
  ClipboardCheck,
  GitCompareArrows,
  Globe,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type NavLink = { href: string; label: string; icon: LucideIcon };

export type NavGroup = { label: string | null; links: NavLink[] };

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

export type NavAccess = {
  showUsers: boolean;
  showOnboarding: boolean;
  /** Platform admins see the cross-organization panel. */
  showPlatform: boolean;
  role: Role;
  hiddenTabs?: readonly string[];
};

export function navGroups({ showUsers, showOnboarding, showPlatform, role, hiddenTabs = [] }: NavAccess): NavGroup[] {
  const accountLinks: NavLink[] = [
    ...(showUsers ? [{ href: "/dashboard/users", label: "Users", icon: Users }] : []),
    ...(showOnboarding ? [{ href: "/dashboard/onboarding", label: "Onboarding", icon: UserPlus }] : []),
    ...(showPlatform ? [{ href: "/dashboard/platform", label: "Platform", icon: Globe }] : []),
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
  return [
    ...groups.map((group) => ({ ...group, links: group.links.filter((link) => !isHiddenForRole(role, link.href, hiddenTabs)) })),
    { label: "Account", links: accountLinks },
  ].filter((group) => group.links.length > 0);
}

export function isActiveLink(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavMain(access: NavAccess) {
  const pathname = usePathname();
  const pillId = useId();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const iconRail = state === "collapsed" && !isMobile;
  const visible = navGroups(access);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [seenPath, setSeenPath] = useState(pathname);

  if (seenPath !== pathname) {
    setSeenPath(pathname);
    const current = visible.find((group) => group.label && group.links.some((link) => isActiveLink(pathname, link.href)));
    if (current?.label && closed.has(current.label)) {
      const next = new Set(closed);
      next.delete(current.label);
      setClosed(next);
    }
  }

  function setGroupOpen(label: string, open: boolean) {
    const next = new Set(closed);
    if (open) next.delete(label);
    else next.add(label);
    setClosed(next);
  }

  function renderLinks(links: NavLink[]) {
    return (
      <SidebarMenu>
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActiveLink(pathname, href);
          return (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={label}
                className="relative rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:bg-transparent data-active:font-medium data-active:text-sidebar-primary-foreground data-active:hover:bg-transparent data-active:hover:text-sidebar-primary-foreground group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
              >
                <Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                  {active ? (
                    <m.span
                      layoutId={pillId}
                      className="absolute inset-0 rounded-lg bg-sidebar-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  ) : null}
                  <Icon className="relative" aria-hidden />
                  <span className="relative">{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    );
  }

  return (
    <nav aria-label="Sections" className="flex flex-col">
      {visible.map((group) =>
        group.label === null ? (
          <SidebarGroup key="top">{renderLinks(group.links)}</SidebarGroup>
        ) : (
          <Collapsible
            key={group.label}
            open={iconRail || !closed.has(group.label)}
            onOpenChange={(open) => {
              if (!iconRail) setGroupOpen(group.label as string, open);
            }}
            className="group/collapsible"
          >
            <SidebarGroup role="group" aria-label={group.label}>
              <SidebarGroupLabel asChild className="label-caps h-7 cursor-pointer justify-between pr-2 hover:text-foreground">
                <CollapsibleTrigger>
                  <span>{group.label}</span>
                  <ChevronRight
                    className={cn("size-3.5 transition-transform duration-200", "group-data-[state=open]/collapsible:rotate-90")}
                    aria-hidden
                  />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent className="overflow-hidden data-open:animate-collapsible-down data-closed:animate-collapsible-up">
                {renderLinks(group.links)}
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ),
      )}
    </nav>
  );
}
