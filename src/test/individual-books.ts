import { exampleBooks } from "@/data/example-books";
import type { Books } from "@/data/books";

/**
 * The example books as an individual's wallets would report them. The example
 * data was written for an organization, and one transaction note talks about
 * a journal entry. An individual's own data never says that, so the pages and
 * reports under test use the same books with that note made neutral.
 */
export const individualBooks: Books = {
  ...exampleBooks,
  sourceTransactions: exampleBooks.sourceTransactions.map((transaction) => ({
    ...transaction,
    description: transaction.description.replace(/ with no journal entry yet\./, "."),
  })),
};
