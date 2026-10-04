"use client";

import Link from "next/link";
import { m, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { content, navigation, signupHref } from "@/components/landing/content";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const targets = navigation
      .map((item) => document.querySelector(item.href))
      .filter((node): node is Element => node !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(`#${visible.target.id}`);
        else if (window.scrollY < 80) setActive(null);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return active;
}

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const active = useActiveSection();
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => setScrolled(latest > 24));

  return (
    <header data-scrolled={scrolled} className="group sticky top-0 z-30">
      <div
        aria-hidden
        className="absolute inset-0 border-b bg-background/75 opacity-0 backdrop-blur-md transition-opacity duration-300 group-data-[scrolled=true]:opacity-100"
      />
      <div className="page-width relative flex h-16 items-center justify-between gap-5">
        <Link
          href="/"
          aria-label="Token Ledger home"
          className="origin-left transition-transform duration-300 group-data-[scrolled=true]:scale-90"
        >
          <Logo />
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "relative rounded-full px-3 py-1.5 transition-colors hover:text-foreground",
                active === item.href && "text-foreground",
              )}
            >
              {active === item.href && (
                <m.span
                  layoutId="landing-nav-pill"
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-full bg-muted"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              {item.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
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
            <SheetContent side="right" className="w-72 gap-0" onCloseAutoFocus={(event) => event.preventDefault()}>
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
                <Button asChild>
                  <Link href={signupHref}>{content.signupLabel}</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
