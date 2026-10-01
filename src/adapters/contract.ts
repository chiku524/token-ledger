/**
 * Shape validators for adapter output. A live source adapter must satisfy
 * these, and the contract test suite asserts it for every adapter. They are
 * also usable at runtime to guard a boundary that receives adapter output.
 */
import type { ListedAccount, NormalizedBalance, NormalizedSourceTransaction } from "./types";

export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

export function validateBalances(rows: unknown): ValidationResult {
  const problems: string[] = [];
  if (!Array.isArray(rows)) return { ok: false, problems: ["balances must be an array"] };
  rows.forEach((row, index) => {
    const at = `balances[${index}]`;
    if (!isObject(row)) return problems.push(`${at} must be an object`);
    if (typeof row.assetCode !== "string" || row.assetCode.trim() === "") problems.push(`${at}.assetCode must be a non-empty string`);
    if (typeof row.quantityMinor !== "bigint") problems.push(`${at}.quantityMinor must be a bigint`);
    else if (row.quantityMinor < 0n) problems.push(`${at}.quantityMinor must not be negative`);
    if (typeof row.asOf !== "string" || Number.isNaN(Date.parse(row.asOf))) problems.push(`${at}.asOf must be an ISO-8601 time`);
  });
  return { ok: problems.length === 0, problems };
}

export function validateTransactions(rows: unknown): ValidationResult {
  const problems: string[] = [];
  if (!Array.isArray(rows)) return { ok: false, problems: ["movements must be an array"] };
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const at = `movements[${index}]`;
    if (!isObject(row)) return problems.push(`${at} must be an object`);
    if (typeof row.externalId !== "string" || row.externalId.trim() === "") problems.push(`${at}.externalId must be a non-empty string`);
    else if (seen.has(row.externalId)) problems.push(`${at}.externalId "${row.externalId}" is duplicated`);
    else seen.add(row.externalId);
    if (typeof row.occurredOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.occurredOn)) problems.push(`${at}.occurredOn must be YYYY-MM-DD`);
    if (typeof row.assetCode !== "string" || row.assetCode.trim() === "") problems.push(`${at}.assetCode must be a non-empty string`);
    if (row.direction !== "in" && row.direction !== "out") problems.push(`${at}.direction must be "in" or "out"`);
    if (typeof row.quantityMinor !== "bigint") problems.push(`${at}.quantityMinor must be a bigint`);
    else if (row.quantityMinor <= 0n) problems.push(`${at}.quantityMinor must be positive`);
    if (typeof row.description !== "string") problems.push(`${at}.description must be a string`);
  });
  return { ok: problems.length === 0, problems };
}

export function validateAccounts(rows: unknown): ValidationResult {
  const problems: string[] = [];
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, problems: ["accounts must be a non-empty array"] };
  rows.forEach((row, index) => {
    const at = `accounts[${index}]`;
    if (!isObject(row)) return problems.push(`${at} must be an object`);
    if (typeof row.externalAccountId !== "string" || row.externalAccountId.trim() === "") problems.push(`${at}.externalAccountId must be a non-empty string`);
    if (typeof row.name !== "string" || row.name.trim() === "") problems.push(`${at}.name must be a non-empty string`);
  });
  return { ok: problems.length === 0, problems };
}

export function describeBalances(rows: readonly NormalizedBalance[]): string {
  return rows.map((row) => `${row.assetCode}=${row.quantityMinor}`).join(", ");
}

export function describeTransactions(rows: readonly NormalizedSourceTransaction[]): string {
  return rows.map((row) => `${row.externalId}:${row.direction}:${row.quantityMinor}`).join(", ");
}

export function accountIds(rows: readonly ListedAccount[]): string[] {
  return rows.map((row) => row.externalAccountId);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
