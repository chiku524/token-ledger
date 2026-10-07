"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Role } from "@/auth/roles";
import { DashboardNav } from "./dashboard-nav";

export function MobileNav({
  showUsers,
  showOnboarding,
  role,
  hiddenTabs,
  footer,
}: {
  showUsers: boolean;
  showOnboarding: boolean;
  role: Role;
  hiddenTabs: readonly string[];
  footer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Open menu">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Token Ledger</SheetTitle>
          <SheetDescription className="sr-only">Sections</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <DashboardNav showUsers={showUsers} showOnboarding={showOnboarding} role={role} hiddenTabs={hiddenTabs} onNavigate={() => setOpen(false)} />
        </div>
        <div className="border-t border-border p-3">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}
