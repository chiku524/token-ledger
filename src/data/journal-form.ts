import { LedgerError, postJournalEntry, toMinor, type JournalEntryInput, type PostedJournalEntry } from "@/ledger";
import type { Books, StoredJournalEntry } from "./books";

interface JournalLineForm {
  accountCode: string;
  side: "debit" | "credit";
  amount: string;
  assetCode?: string;
  quantity?: string;
  quantityDirection?: "in" | "out";
  sourceId?: string;
}

interface JournalForm {
  entityId: string;
  reference: string;
  entryDate: string;
  memo: string;
  lines: JournalLineForm[];
}

const FIAT_SCALE = 2;

export function postFormJournal(form: JournalForm, books: Pick<Books, "entities" | "accounts" | "assets" | "sources">): PostedJournalEntry {
  const entity = books.entities.find((item) => item.id === form.entityId);
  if (!entity) throw new LedgerError("EMPTY_ENTITY", "Choose a company in these books.");

  const input: JournalEntryInput = {
    entityId: entity.id,
    reference: form.reference,
    entryDate: form.entryDate,
    memo: form.memo,
    lines: form.lines.map((line) => {
      const account = books.accounts.find((item) => item.entityId === entity.id && item.code === line.accountCode);
      if (!account) {
        throw new LedgerError("UNKNOWN_ACCOUNT", `Account ${line.accountCode} is not on the accounts for ${entity.name}.`);
      }
      const quantity = quantityFields(line, books, entity.id);
      return {
        accountCode: account.code,
        side: line.side,
        amountMinor: toMinor(line.amount, FIAT_SCALE),
        currency: entity.functionalCurrency,
        ...quantity,
      };
    }),
  };
  return postJournalEntry(input);
}

/**
 * Validate a journal form into draft lines (no id, no posting). Uses the same
 * per-line rules as posting, so a draft cannot hold an entry that could never
 * post. Returns the entity, totals, and lines for a draft row.
 */
export function draftFromForm(
  form: JournalForm,
  books: Pick<Books, "entities" | "accounts" | "assets" | "sources">,
): {
  entityId: string;
  currency: string;
  lines: Array<{
    accountCode: string;
    side: "debit" | "credit";
    amountMinor: bigint;
    currency: string;
    assetCode?: string;
    quantityMinor?: bigint;
    quantityDirection?: "in" | "out";
    sourceId?: string;
  }>;
} {
  const posted = postFormJournal(form, books);
  return {
    entityId: posted.entityId,
    currency: posted.currency,
    lines: posted.lines.map((line) => ({
      accountCode: line.accountCode,
      side: line.side,
      amountMinor: line.amountMinor,
      currency: line.currency,
      assetCode: line.assetCode,
      quantityMinor: line.quantityMinor,
      quantityDirection: line.quantityDirection,
      sourceId: line.sourceId,
    })),
  };
}

export function assertCanReverse(entries: readonly StoredJournalEntry[], entryId: string): StoredJournalEntry {
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) throw new LedgerError("EMPTY_REFERENCE", "That entry is not in these books.");
  const existing = entries.find((item) => item.reversesEntryId === entry.id);
  if (existing) {
    throw new LedgerError("DUPLICATE_ID", `${entry.reference} already has correction ${existing.reference}.`);
  }
  return entry;
}

function quantityFields(
  line: JournalForm["lines"][number],
  books: Pick<Books, "assets" | "sources">,
  entityId: string,
): Pick<JournalEntryInput["lines"][number], "quantityMinor" | "assetCode" | "quantityDirection" | "sourceId"> {
  const anyQuantity = line.assetCode || line.quantity || line.quantityDirection || line.sourceId;
  if (!anyQuantity) return {};
  if (!line.assetCode || !line.quantity || !line.quantityDirection || !line.sourceId) {
    throw new LedgerError(
      "QUANTITY_WITHOUT_ASSET",
      `Line ${line.accountCode} needs an asset, an amount, whether it was received or sent, and where it was held.`,
    );
  }
  const asset = books.assets.find((item) => item.code === line.assetCode);
  if (!asset) throw new LedgerError("MISSING_ASSET", `Unknown asset ${line.assetCode}.`);
  const source = books.sources.find((item) => item.id === line.sourceId && item.entityId === entityId);
  if (!source) throw new LedgerError("QUANTITY_WITHOUT_SOURCE", "That wallet, exchange, or custodian is not on this company.");
  return {
    assetCode: asset.code,
    quantityMinor: toMinor(line.quantity, asset.decimals),
    quantityDirection: line.quantityDirection,
    sourceId: source.id,
  };
}
