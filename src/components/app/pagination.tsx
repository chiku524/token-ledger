import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Page as PageWindow } from "@/data/pagination";
import { pageHref } from "@/data/pagination";

/**
 * Next/previous controls for a paged table. Renders nothing when everything
 * fits on one page, so simple organizations see no chrome. Server component:
 * the links carry `?…&page=` and the query survives navigation.
 */
export function Pagination({
  page,
  base,
  query,
  label,
}: {
  page: Pick<PageWindow<unknown>, "page" | "pageCount" | "total" | "from" | "to">;
  base: string;
  query: Record<string, string>;
  label: string;
}) {
  if (page.pageCount <= 1) return null;
  const href = (target: number) => pageHref(base, query, target);
  return (
    <nav
      aria-label={label}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <p>
        Showing <span className="font-mono tabular-nums">{page.from}</span>–
        <span className="font-mono tabular-nums">{page.to}</span> of{" "}
        <span className="font-mono tabular-nums">{page.total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link
            href={href(page.page - 1)}
            aria-disabled={page.page <= 1}
            tabIndex={page.page <= 1 ? -1 : undefined}
            className={page.page <= 1 ? "pointer-events-none opacity-50" : undefined}
          >
            <ChevronLeft />
            Previous
          </Link>
        </Button>
        <span className="px-1 whitespace-nowrap">
          Page <span className="font-mono tabular-nums">{page.page}</span> of{" "}
          <span className="font-mono tabular-nums">{page.pageCount}</span>
        </span>
        <Button asChild variant="outline" size="sm">
          <Link
            href={href(page.page + 1)}
            aria-disabled={page.page >= page.pageCount}
            tabIndex={page.page >= page.pageCount ? -1 : undefined}
            className={page.page >= page.pageCount ? "pointer-events-none opacity-50" : undefined}
          >
            Next
            <ChevronRight />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
