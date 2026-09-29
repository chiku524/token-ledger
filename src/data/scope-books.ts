import type { Books } from "./books";
import type { Role } from "@/auth/roles";

export function scopeBooks(books: Books, actor: { role: Role; entityScope: readonly string[] }): Books {
  if (actor.role === "owner" || actor.role === "admin" || actor.entityScope.length === 0) return books;
  const allowed = new Set(actor.entityScope);
  const entities = books.entities.filter((entity) => allowed.has(entity.id));
  const entityIds = new Set(entities.map((entity) => entity.id));
  return {
    ...books,
    entities,
    accounts: books.accounts.filter((account) => entityIds.has(account.entityId)),
    sources: books.sources.filter((source) => entityIds.has(source.entityId)),
    journalEntries: books.journalEntries.filter((entry) => entityIds.has(entry.entityId)),
    sourceTransactions: books.sourceTransactions.filter((transaction) => entityIds.has(transaction.entityId)),
    reconciliations: books.reconciliations.filter((record) => entityIds.has(record.entityId)),
  };
}
