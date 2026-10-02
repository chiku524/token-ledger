import { ChevronsUpDown } from "lucide-react";
import { signOutAction } from "@/app/sign-in/actions";
import type { SessionUser } from "@/auth/current";
import { roleLabel } from "@/auth/roles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutMenuItem } from "./sign-out-menu-item";

export function UserMenu({ session, csrf, scopeLabel }: { session: SessionUser; csrf: string; scopeLabel: string | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" className="h-auto w-full justify-between px-2 py-2 text-left">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{session.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{roleLabel(session.role)}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
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
  );
}
