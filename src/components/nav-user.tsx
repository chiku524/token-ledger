"use client";

import { ChevronsUpDown } from "lucide-react";
import { signOutAction } from "@/app/sign-in/actions";
import type { SessionUser } from "@/auth/current";
import { roleLabel } from "@/auth/roles";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { SignOutMenuItem } from "./sign-out-menu-item";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

export function NavUser({ session, csrf, scopeLabel }: { session: SessionUser; csrf: string; scopeLabel: string | null }) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground">
              <Avatar className="size-8 rounded-lg after:rounded-lg">
                <AvatarFallback className="rounded-lg text-xs font-medium">{initials(session.name)}</AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{session.name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{roleLabel(session.role)}</span>
              </span>
              <ChevronsUpDown className="ml-auto text-muted-foreground" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side={isMobile ? "bottom" : "right"} sideOffset={4} className="w-64">
            <DropdownMenuLabel className="space-y-1 font-normal">
              <span className="block truncate text-sm font-medium text-foreground">{session.email}</span>
              {session.demo ? <span className="block text-xs text-danger">Sample preview · not saved</span> : null}
              {scopeLabel ? <span className="block text-xs text-muted-foreground">{scopeLabel}</span> : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <input type="hidden" name="csrf" value={csrf} />
              <SignOutMenuItem />
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
