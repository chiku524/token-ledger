import type { JournalEntryInput, JournalLineInput, PostedJournalEntry } from "./types";
import { LedgerError } from "./types";

const ISO_CURRENCY = /^[A-Z]{3}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Post one journal entry. Rejects anything that is not a balanced
 * double-entry in a single functional currency.
 */
export function postJournalEntry(input: JournalEntryInput): PostedJournalEntry {
  const entityId = requiredText(input.entityId, "EMPTY_ENTITY", "entityId is required.");
  const reference = requiredText(input.reference, "EMPTY_REFERENCE", "reference is required.");
  const memo = requiredText(input.memo, "EMPTY_MEMO", "memo is required so the audit trail has a description.");
  const entryDate = assertEntryDate(input.entryDate);
  const lines = input.lines ?? [];
  if (lines.length < 2) {
    throw new LedgerError("TOO_FEW_LINES", `Entry ${reference} needs at least two lines.`);
  }

  const currency = assertCurrency(lines[0]?.currency, reference);
  let debitMinor = 0n;
  let creditMinor = 0n;

  const postedLines = lines.map((line, index) => {
    const posted = normalizeLine(line, reference, currency);
    if (posted.side === "debit") debitMinor += posted.amountMinor;
    else creditMinor += posted.amountMinor;
    return { ...posted, lineNumber: index + 1 };
  });

  if (debitMinor !== creditMinor) {
    throw new LedgerError(
      "UNBALANCED",
      `Entry ${reference} is unbalanced in ${currency}: debits ${debitMinor} credits ${creditMinor}.`,
    );
  }

  const id = input.id === undefined ? crypto.randomUUID() : requiredText(input.id, "EMPTY_REFERENCE", "id cannot be blank.");

  return {
    id,
    entityId,
    reference,
    entryDate,
    memo,
    currency,
    debitMinor,
    creditMinor,
    lines: postedLines,
  };
}

export function assertUniqueEntryIds(entries: readonly PostedJournalEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new LedgerError("DUPLICATE_ID", `Duplicate journal entry id ${entry.id}.`);
    }
    seen.add(entry.id);
  }
}

function normalizeLine(line: JournalLineInput, reference: string, entryCurrency: string) {
  const accountCode = requiredText(line.accountCode, "EMPTY_ACCOUNT", `Entry ${reference} has a line with no account.`);
  if (line.side !== "debit" && line.side !== "credit") {
    throw new LedgerError("INVALID_SIDE", `Entry ${reference} has a line that is neither debit nor credit.`);
  }
  const currency = assertCurrency(line.currency, reference);
  if (currency !== entryCurrency) {
    throw new LedgerError(
      "MIXED_CURRENCY",
      `Entry ${reference} mixes ${entryCurrency} and ${currency}. Record the entry in one functional currency.`,
    );
  }
  if (typeof line.amountMinor !== "bigint" || line.amountMinor <= 0n) {
    throw new LedgerError(
      "NON_POSITIVE_AMOUNT",
      `Entry ${reference} account ${accountCode} needs a positive bigint amountMinor.`,
    );
  }

  const hasQuantity = line.quantityMinor !== undefined;
  if (hasQuantity) {
    if (typeof line.quantityMinor !== "bigint" || line.quantityMinor <= 0n) {
      throw new LedgerError(
        "NON_POSITIVE_QUANTITY",
        `Entry ${reference} account ${accountCode} quantityMinor must be a positive bigint.`,
      );
    }
    if (!line.assetCode?.trim()) {
      throw new LedgerError(
        "QUANTITY_WITHOUT_ASSET",
        `Entry ${reference} account ${accountCode} moves a quantity without an assetCode.`,
      );
    }
    if (line.quantityDirection !== "in" && line.quantityDirection !== "out") {
      throw new LedgerError(
        "QUANTITY_WITHOUT_DIRECTION",
        `Entry ${reference} account ${accountCode} quantity needs direction "in" or "out".`,
      );
    }
    if (!line.sourceId?.trim()) {
      throw new LedgerError(
        "QUANTITY_WITHOUT_SOURCE",
        `Entry ${reference} account ${accountCode} quantity needs a sourceId.`,
      );
    }
  } else if (line.assetCode || line.quantityDirection || line.sourceId) {
    throw new LedgerError(
      "NON_POSITIVE_QUANTITY",
      `Entry ${reference} account ${accountCode} sets asset, direction, or source without a quantity.`,
    );
  }

  return {
    accountCode,
    side: line.side,
    amountMinor: line.amountMinor,
    currency,
    quantityMinor: line.quantityMinor,
    assetCode: line.assetCode?.trim(),
    quantityDirection: line.quantityDirection,
    sourceId: line.sourceId?.trim(),
    memo: line.memo?.trim() || undefined,
  };
}

function assertCurrency(currency: string | undefined, reference: string): string {
  if (!currency || !ISO_CURRENCY.test(currency)) {
    throw new LedgerError(
      "INVALID_CURRENCY",
      `Entry ${reference} needs a 3-letter functional currency on every line.`,
    );
  }
  return currency;
}

function assertEntryDate(value: string | undefined): string {
  const match = ISO_DATE.exec(value ?? "");
  if (!match) {
    throw new LedgerError("INVALID_DATE", "entryDate must be YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new LedgerError("INVALID_DATE", `entryDate ${value} is not a real calendar date.`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function requiredText(
  value: string | undefined,
  code: "EMPTY_ENTITY" | "EMPTY_REFERENCE" | "EMPTY_MEMO" | "EMPTY_ACCOUNT",
  message: string,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new LedgerError(code, message);
  return trimmed;
}
