"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { content, exampleHref, navigation, signupHref } from "@/components/landing/content";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="page-width relative z-20 flex h-24 items-center justify-between gap-5">
      <Link href="/" aria-label="Token Ledger home">
        <Logo />
      </Link>
      <nav aria-label="Main navigation" className="hidden items-center gap-8 text-xs text-muted-foreground md:flex">
        {navigation.map((item) => (
          <a key={item.href} href={item.href} className="transition-colors hover:text-foreground">
            {item.label}
          </a>
        ))}
      </nav>
      <div className="hidden items-center gap-3 md:flex">
        <ThemeToggle />
        <Button asChild variant="outline">
          <Link href={exampleHref}>View demo</Link>
        </Button>
        <Button asChild>
          <Link href={signupHref}>{content.signupLabel}</Link>
        </Button>
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <ThemeToggle />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Open navigation">
              <Menu aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 gap-0">
            <SheetHeader>
              <SheetTitle>Token Ledger</SheetTitle>
              <SheetDescription className="sr-only">Site navigation</SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile navigation" className="flex flex-col gap-1 px-4">
              {navigation.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-sm hover:bg-accent"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 grid gap-2 px-4">
              <Button asChild variant="outline">
                <Link href={exampleHref}>View demo</Link>
              </Button>
              <Button asChild>
                <Link href={signupHref}>{content.signupLabel}</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
