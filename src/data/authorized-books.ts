import { cache } from "react";
import type { SessionUser } from "@/auth/current";
import { requireSession } from "@/auth/current";
import type { Books } from "./books";
import { booksAreWritable, loadBooks } from "./load-books";
import { scopeBooks } from "./scope-books";

export const loadAuthorizedBooks = cache(async (): Promise<{ session: SessionUser; books: Books }> => {
  const session = await requireSession();
  const books = scopeBooks(await loadBooks(), session);
  return { session, books };
});

export function canWriteBooks(session: SessionUser): boolean {
  return booksAreWritable() && !session.demo;
}
