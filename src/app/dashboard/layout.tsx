import { DashboardShell } from "@/components/dashboard-shell";
import { booksAreWritable, loadBooks } from "@/data/load-books";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const books = await loadBooks();
  const subtitle =
    books.organization.origin === "live"
      ? "Live books"
      : booksAreWritable()
        ? "Example books in Postgres"
        : "Example books";

  return (
    <DashboardShell origin={books.organization.origin} notice={books.notice} subtitle={subtitle}>
      {children}
    </DashboardShell>
  );
}
