import { toMinor } from "@/ledger";

export interface ParsedSourceTransaction {
  externalId: string;
  occurredOn: string;
  assetCode: string;
  direction: "in" | "out";
  quantityMinor: bigint;
  description: string;
}

export interface CsvParseSuccess {
  ok: true;
  rows: ParsedSourceTransaction[];
}

export interface CsvParseFailure {
  ok: false;
  errors: string[];
}

const HEADER = ["external_id", "occurred_on", "asset_code", "direction", "quantity", "description"] as const;
const MAX_ROWS = 500;
const MAX_CHARS = 200_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a source-transaction CSV. Quantity is in major units and is converted
 * with the asset's decimals. The file does not post a journal.
 */
export function parseSourceTransactionCsv(
  text: string,
  assets: readonly { code: string; decimals: number }[],
): CsvParseSuccess | CsvParseFailure {
  if (text.length > MAX_CHARS) {
    return { ok: false, errors: [`CSV is longer than ${MAX_CHARS} characters.`] };
  }
  let records: string[][];
  try {
    records = splitCsvRecords(stripBom(text));
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "CSV could not be parsed."] };
  }
  if (records.length === 0) return { ok: false, errors: ["CSV is empty."] };

  const header = records[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  if (header.length !== HEADER.length || HEADER.some((name, index) => header[index] !== name)) {
    return {
      ok: false,
      errors: [`Header must be ${HEADER.join(",")}.`],
    };
  }

  const body = records.slice(1).filter((record) => record.some((cell) => cell.trim() !== ""));
  if (body.length === 0) return { ok: false, errors: ["CSV has no data rows."] };
  if (body.length > MAX_ROWS) return { ok: false, errors: [`CSV has more than ${MAX_ROWS} data rows.`] };

  const decimals = new Map(assets.map((asset) => [asset.code, asset.decimals]));
  const errors: string[] = [];
  const seen = new Set<string>();
  const rows: ParsedSourceTransaction[] = [];

  body.forEach((record, index) => {
    const line = index + 2;
    if (record.length !== HEADER.length) {
      errors.push(`Line ${line} has ${record.length} columns; expected ${HEADER.length}.`);
      return;
    }
    const [externalId, occurredOn, assetCode, direction, quantity, description] = record.map((cell) => cell.trim()) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    let lineFailed = false;
    const fail = (message: string) => {
      lineFailed = true;
      errors.push(message);
    };
    if (!externalId) fail(`Line ${line} is missing external_id.`);
    if (externalId && seen.has(externalId)) fail(`Line ${line} repeats external_id ${externalId}.`);
    if (externalId) seen.add(externalId);
    if (!DATE.test(occurredOn) || !isRealDate(occurredOn)) fail(`Line ${line} has an invalid occurred_on.`);
    const scale = decimals.get(assetCode);
    if (scale === undefined) fail(`Line ${line} uses unknown asset ${assetCode || "(blank)"}.`);
    if (direction !== "in" && direction !== "out") fail(`Line ${line} direction must be in or out.`);
    if (!description) fail(`Line ${line} is missing a description.`);
    if (lineFailed || scale === undefined) return;
    try {
      rows.push({
        externalId,
        occurredOn,
      assetCode,
      direction: direction === "out" ? "out" : "in",
        quantityMinor: toMinor(quantity, scale as number),
        description,
      });
    } catch (error) {
      errors.push(`Line ${line} quantity: ${error instanceof Error ? error.message : "invalid"}.`);
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function splitCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (quoted) throw new Error("CSV has an unterminated quote.");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  return records;
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
