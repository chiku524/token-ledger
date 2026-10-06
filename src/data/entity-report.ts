import type { SessionUser } from "@/auth/current";
import { can } from "@/auth/roles";
import { assetCarryingSchedule, financialStatements, trialBalance } from "@/ledger";
import type { Books } from "./books";
import { reportAssetBars, reportComposition } from "./charts";
import { booksAreWritable } from "./load-books";
import type { DateRange } from "./period";
import { sliceBooks } from "./slice-books";
import { revaluationForEntity } from "./valuation";

export function canRevalue(session: SessionUser): boolean {
  return can(session.role, "journal.post") && booksAreWritable() && !session.demo;
}

export function entityReport(input: { books: Books; entityId: string; range: DateRange; includeRevaluation: boolean }) {
  const { books, entityId, range } = input;
  const scoped = sliceBooks(books, range);
  const entity = books.entities.find((item) => item.id === entityId);
  const balance = trialBalance(scoped.journalEntries, books.accounts, entityId);
  const statements = financialStatements(scoped.journalEntries, books.accounts, books.assets, entityId);
  const revaluation =
    input.includeRevaluation && entity
      ? revaluationForEntity({
          entries: books.journalEntries,
          accounts: books.accounts,
          assets: books.assets,
          prices: books.assetPrices,
          entityId,
          quoteCurrency: entity.functionalCurrency,
          assetAccountCode: "1310",
          gainAccountCode: "4200",
          lossAccountCode: "5200",
          asOf: range.to,
        })
      : null;
  return {
    balance,
    balanced: balance.debitTotal === balance.creditTotal,
    statements,
    carrying: assetCarryingSchedule(scoped.journalEntries, books.accounts, entityId),
    assetBars: reportAssetBars(entityId, scoped),
    composition: reportComposition(entityId, scoped),
    revaluation,
  };
}

export type EntityReport = ReturnType<typeof entityReport>;
