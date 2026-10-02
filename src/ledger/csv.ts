/** CSV builders for reports. Amounts are decimal strings, not minor units. */

export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export interface CsvAmount {
  format(amountMinor: bigint, currency: string): string;
}

/** The append-only audit log as CSV. One row per event, newest first. */
export function auditCsv(
  rows: readonly {
    occurredAt: string;
    actor: string;
    action: string;
    subjectType: string;
    subjectId: string;
    detail: string;
  }[],
): string {
  return toCsv(
    ["occurred_at", "actor", "action", "subject_type", "subject_id", "detail"],
    rows.map((row) => [row.occurredAt, row.actor, row.action, row.subjectType, row.subjectId, row.detail]),
  );
}

export function trialBalanceCsv(input: {
  entityName: string;
  currency: string | null;
  rows: readonly { code: string; name: string; debitMinor: bigint; creditMinor: bigint; netMinor: bigint }[];
  formatAmount: (amountMinor: bigint) => string;
}): string {
  return toCsv(
    ["entity", "currency", "code", "account", "debit", "credit", "net"],
    input.rows.map((row) => [
      input.entityName,
      input.currency ?? "",
      row.code,
      row.name,
      input.formatAmount(row.debitMinor),
      input.formatAmount(row.creditMinor),
      input.formatAmount(row.netMinor),
    ]),
  );
}

export function journalCsv(
  rows: readonly {
    entryDate: string;
    reference: string;
    entityName: string;
    currency: string;
    accountCode: string;
    accountName: string;
    side: string;
    amount: string;
    assetCode: string;
    quantity: string;
    sourceName: string;
    memo: string;
    postedBy: string;
    reverses: string;
  }[],
): string {
  return toCsv(
    [
      "entry_date",
      "reference",
      "entity",
      "currency",
      "account_code",
      "account",
      "side",
      "amount",
      "asset",
      "quantity",
      "source",
      "memo",
      "posted_by",
      "reverses",
    ],
    rows.map((row) => [
      row.entryDate,
      row.reference,
      row.entityName,
      row.currency,
      row.accountCode,
      row.accountName,
      row.side,
      row.amount,
      row.assetCode,
      row.quantity,
      row.sourceName,
      row.memo,
      row.postedBy,
      row.reverses,
    ]),
  );
}

export function reconciliationCsv(
  rows: readonly {
    status: string;
    sourceName: string;
    externalId: string;
    journalReference: string;
    assetCode: string;
    direction: string;
    quantity: string;
    note: string;
  }[],
): string {
  return toCsv(
    ["status", "source", "external_id", "journal", "asset", "direction", "quantity", "note"],
    rows.map((row) => [
      row.status,
      row.sourceName,
      row.externalId,
      row.journalReference,
      row.assetCode,
      row.direction,
      row.quantity,
      row.note,
    ]),
  );
}
