import { DashboardShell } from "@/components/dashboard-shell";
import { booksAreWritable, loadBooks } from "@/data/load-books";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const books = await loadBooks();
  const subtitle =
    books.organization.origin === "live"
      ? "Saved"
      : booksAreWritable()
        ? "Sample, saved"
        : "Sample";

  return (
    <DashboardShell origin={books.organization.origin} notice={books.notice} subtitle={subtitle}>
      {children}
    </DashboardShell>
  );
}
