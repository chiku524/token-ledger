import { cache } from "react";
import { connection } from "next/server";
import { readDatabaseUrl } from "@/env";
import type { Books } from "./books";
import { exampleBooks } from "./example-books";

/**
 * Postgres when DATABASE_URL is set, otherwise the in-process example books.
 * Pass the signed-in organization so a newly created set of books is not shown to everyone else.
 */
export const loadBooks = cache(async (organizationId?: string): Promise<Books> => {
  await connection();
  const url = readDatabaseUrl();
  if (!url) return exampleBooks;
  const { loadBooksFromDatabase } = await import("@/db/read");
  return loadBooksFromDatabase(organizationId);
});

export function booksAreWritable(): boolean {
  return readDatabaseUrl() !== null;
}
