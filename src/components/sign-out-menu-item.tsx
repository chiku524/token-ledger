"use client";

import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function SignOutMenuItem() {
  return (
    <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
      <button type="submit" className="w-full">
        <LogOut aria-hidden />
        Sign out
      </button>
    </DropdownMenuItem>
  );
}
