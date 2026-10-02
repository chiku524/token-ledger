import { cache } from "react";
import { connection } from "next/server";
import { hasDatabase } from "@/db/availability";
import type { Books } from "./books";
import { exampleBooks } from "./example-books";

/**
 * Postgres when DATABASE_URL is set, otherwise the in-process example books.
 * Pass the signed-in organization so a newly created set of books is not shown to everyone else.
 */
export const loadBooks = cache(async (organizationId?: string): Promise<Books> => {
  await connection();
  return loadBooksForJob(organizationId);
});

/**
 * Load books outside a request. A scheduler, worker, or CLI has no React
 * request scope, so it must skip `connection()`. Falls back to the example
 * books when no database is configured.
 */
export async function loadBooksForJob(organizationId?: string): Promise<Books> {
  if (!hasDatabase()) return exampleBooks;
  const { loadBooksFromDatabase } = await import("@/db/read");
  return loadBooksFromDatabase(organizationId);
}

export function booksAreWritable(): boolean {
  return hasDatabase();
}
