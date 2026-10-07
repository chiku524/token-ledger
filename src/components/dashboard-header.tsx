"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { isActiveLink, navGroups, type NavAccess } from "./nav-main";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

function crumbs(access: NavAccess, pathname: string): string[] {
  let best: { group: string | null; label: string; length: number } | null = null;
  for (const group of navGroups(access)) {
    for (const link of group.links) {
      if (isActiveLink(pathname, link.href) && (!best || link.href.length > best.length)) {
        best = { group: group.label, label: link.label, length: link.href.length };
      }
    }
  }
  if (!best) return ["Dashboard"];
  return best.group ? [best.group, best.label] : [best.label];
}

export function DashboardHeader(access: NavAccess) {
  const pathname = usePathname();
  const trail = crumbs(access, pathname);

  return (
    <header
      data-print="hide"
      className="sticky top-0 z-20 h-12 shrink-0 border-b border-border bg-background/80 backdrop-blur"
    >
      <div className="dashboard-width flex h-full items-center gap-2 px-4 md:px-8">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
        <Link href="/" className="md:hidden">
          <Logo size="sm" />
        </Link>
        <Breadcrumb className="hidden min-w-0 sm:block">
          <BreadcrumbList>
            {trail.map((label, index) => (
              <Fragment key={label}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {index === trail.length - 1 ? <BreadcrumbPage>{label}</BreadcrumbPage> : <span className="text-muted-foreground">{label}</span>}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
