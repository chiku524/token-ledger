"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/entities", label: "Entities" },
  { href: "/dashboard/sources", label: "Sources" },
  { href: "/dashboard/ledger", label: "Ledger" },
  { href: "/dashboard/reconciliation", label: "Reconciliation" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/consolidation", label: "Consolidation" },
  { href: "/dashboard/audit", label: "Audit" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Ledger" className="flex gap-1 overflow-x-auto md:flex-col">
      {links.map((link) => {
        const active = link.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded px-3 py-2 text-sm ${
              active ? "bg-ink text-paper" : "text-ink hover:bg-paper-raised"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
