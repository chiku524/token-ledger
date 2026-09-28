/**
 * Pure double-entry types. Amounts are integers in minor units (sen, cents,
 * wei, lamports). The ledger never uses floating point.
 */

export type Side = "debit" | "credit";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type QuantityDirection = "in" | "out";

export interface JournalLineInput {
  accountCode: string;
  side: Side;
  /** Positive functional-currency amount in minor units. */
  amountMinor: bigint;
  /** ISO 4217 functional currency. Every line in an entry must match. */
  currency: string;
  /** Crypto or token quantity in the asset's minor units, when this line moves a position. */
  quantityMinor?: bigint;
  assetCode?: string;
  /** Required when quantityMinor is set. `in` increases the source position. */
  quantityDirection?: QuantityDirection;
  /** Wallet, exchange, or custodian this quantity moved through. */
  sourceId?: string;
  memo?: string;
}

export interface JournalEntryInput {
  id?: string;
  entityId: string;
  /** Stable human reference, for example JE-2026-004. */
  reference: string;
  /** Accounting date, YYYY-MM-DD. */
  entryDate: string;
  memo: string;
  lines: JournalLineInput[];
}

export interface PostedJournalLine extends JournalLineInput {
  lineNumber: number;
}

export interface PostedJournalEntry {
  id: string;
  entityId: string;
  reference: string;
  entryDate: string;
  memo: string;
  currency: string;
  debitMinor: bigint;
  creditMinor: bigint;
  lines: PostedJournalLine[];
}

export interface LedgerAccount {
  entityId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: Side;
  measurementBasis: string | null;
}

export type LedgerErrorCode =
  | "EMPTY_ENTITY"
  | "EMPTY_REFERENCE"
  | "EMPTY_MEMO"
  | "INVALID_DATE"
  | "TOO_FEW_LINES"
  | "EMPTY_ACCOUNT"
  | "INVALID_SIDE"
  | "INVALID_CURRENCY"
  | "NON_POSITIVE_AMOUNT"
  | "MIXED_CURRENCY"
  | "QUANTITY_WITHOUT_ASSET"
  | "QUANTITY_WITHOUT_DIRECTION"
  | "QUANTITY_WITHOUT_SOURCE"
  | "NON_POSITIVE_QUANTITY"
  | "UNBALANCED"
  | "UNKNOWN_ACCOUNT"
  | "MISSING_ASSET"
  | "DUPLICATE_ID";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}
