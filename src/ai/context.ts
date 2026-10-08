import { cache } from "react";
import type { SessionUser } from "@/auth/current";
import { getSession } from "@/auth/current";
import { scopeBooks } from "@/data/scope-books";
import { loadBooks } from "@/data/load-books";
import { loadOnboardingHiddenTabs } from "@/data/onboarding";
import type { Books } from "@/data/books";
import type { ToolContext } from "./tools/types";

/**
 * Build the tool context for a turn: the session, the books already scoped to
 * the session's entities, and the onboarding hidden tabs. Cached per request so
 * a chat turn and a page load share one books read. Never used without a
 * session: an unauthenticated caller cannot obtain a context.
 */
export const loadToolContext = cache(async (csrf: string | null): Promise<ToolContext | null> => {
  const session = await getSession();
  if (!session) return null;
  const books = scopeBooks(await loadBooks(session.organizationId), session);
  const hiddenTabs = session.role === "onboarding" && !session.demo ? await loadOnboardingHiddenTabs(session.organizationId) : [];
  return { session, books, hiddenTabs, csrf };
});

/** The books and hidden tabs a read tool may use, from a known session. */
export async function toolContextFor(session: SessionUser, csrf: string | null): Promise<ToolContext> {
  const books: Books = scopeBooks(await loadBooks(session.organizationId), session);
  const hiddenTabs = session.role === "onboarding" && !session.demo ? await loadOnboardingHiddenTabs(session.organizationId) : [];
  return { session, books, hiddenTabs, csrf };
}
