import { cache } from "react";
import type { SessionUser } from "@/auth/current";
import { keepInOwnArea } from "@/auth/account-home";
import { requireSession } from "@/auth/current";
import type { Books } from "./books";
import { exampleBooks } from "./example-books";
import { booksAreWritable, loadBooks } from "./load-books";
import { scopeBooks } from "./scope-books";

/**
 * The books a session should see. The fixed example books when the session is a
 * demo, or when the "Demo data" switch is on; otherwise the organization's own
 * books from the database (or the in-process example fallback with no database).
 * The result is scoped to the user's companies, so demo books (which clear the
 * scope) come through whole.
 */
export async function booksForSession(session: SessionUser): Promise<Books> {
  const source = session.demo || session.demoBooks ? exampleBooks : await loadBooks(session.organizationId);
  return scopeBooks(source, session);
}

export const loadAuthorizedBooks = cache(async (): Promise<{ session: SessionUser; books: Books }> => {
  const session = await requireSession();
  await keepInOwnArea(session.accountType);
  const books = await booksForSession(session);
  return { session, books };
});

/** Writes need a database and a real session. Demo data is always read-only. */
export function canWriteBooks(session: SessionUser): boolean {
  return booksAreWritable() && !session.demo && !session.demoBooks;
}
