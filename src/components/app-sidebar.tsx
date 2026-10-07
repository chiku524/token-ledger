"use client";

import Link from "next/link";
import type { SessionUser } from "@/auth/current";
import { NavMain, type NavAccess } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { LogoMark } from "./logo";

export function AppSidebar({
  subtitle,
  session,
  csrf,
  scopeLabel,
  ...access
}: NavAccess & { subtitle: string; session: SessionUser; csrf: string; scopeLabel: string | null }) {
  return (
    <Sidebar collapsible="icon" data-print="hide">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Token Ledger">
              <Link href="/">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-background">
                  <LogoMark className="h-3.5 w-auto" />
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate font-logo text-[13px] font-semibold">Token Ledger</span>
                  <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain {...access} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser session={session} csrf={csrf} scopeLabel={scopeLabel} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
