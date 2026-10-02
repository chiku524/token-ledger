import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegmentedLinkItem = { key: string; href: string; label: string; current: boolean };

/** Link-based switcher (for example the company picker on Reports and Combined). */
export function SegmentedLinks({
  label,
  items,
  className,
}: {
  label: string;
  items: SegmentedLinkItem[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm transition-colors",
            item.current
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-card hover:border-brand",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
