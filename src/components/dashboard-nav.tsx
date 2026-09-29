"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/entities", label: "Companies" },
  { href: "/dashboard/sources", label: "Holdings" },
  { href: "/dashboard/ledger", label: "Journal" },
  { href: "/dashboard/reconciliation", label: "Matching" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/consolidation", label: "Combined" },
  { href: "/dashboard/audit", label: "History" },
];

export function DashboardNav({ showUsers }: { showUsers: boolean }) {
  const pathname = usePathname();
  const items = showUsers ? [...links, { href: "/dashboard/users", label: "Users" }] : links;

  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((link) => {
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
