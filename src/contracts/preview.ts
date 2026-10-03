/**
 * The transaction preview shown before a signature, and the rules that make it
 * complete. The plan requires that before every signature the user sees the
 * action, network, asset, exact amount, recipient, fees and affected policy. A
 * preview missing any of these must not be shown as ready to sign.
 *
 * This module is pure: it builds and checks the summary, and holds no key.
 */
import type { SolanaDeployment } from "@/config/solana";

export type PreviewAction =
  | "billing.create_vault"
  | "billing.create_plan"
  | "billing.deposit"
  | "billing.withdraw"
  | "billing.activate"
  | "billing.replace"
  | "billing.revoke"
  | "billing.collect"
  | "treasury.initialize"
  | "treasury.deposit"
  | "treasury.propose"
  | "treasury.approve"
  | "treasury.revoke_approval"
  | "treasury.cancel"
  | "treasury.execute"
  | "treasury.pause"
  | "treasury.governance"
  | "treasury.exit";

export interface AmountDisplay {
  /** Minor units as a decimal string; never a float. */
  minor: string;
  /** Decimals of the asset, e.g. 6 for USDC. */
  decimals: number;
  /** Ticker for display, e.g. "USDC". */
  asset: string;
}

export interface TransactionPreview {
  action: PreviewAction;
  cluster: SolanaDeployment["cluster"];
  /** The program the transaction calls. */
  programId: string;
  /** Who pays the network fee. */
  feePayer: string;
  /** Present when the action moves a token; omitted otherwise (never zero-guessed). */
  amount?: AmountDisplay;
  /** The recipient owner address, when the action pays someone. */
  recipientOwner?: string;
  /** The treasury or vault the action affects, when relevant. */
  subject?: string;
  /** Plain-language statement of what this signature does and does not do. */
  policyNote: string;
}

/** Render a minor-unit amount with its decimals, exactly, as a decimal string. */
export function formatMinor(amount: AmountDisplay): string {
  const negative = amount.minor.startsWith("-");
  const digits = (negative ? amount.minor.slice(1) : amount.minor).padStart(amount.decimals + 1, "0");
  const whole = digits.slice(0, digits.length - amount.decimals) || "0";
  const fraction = amount.decimals > 0 ? digits.slice(digits.length - amount.decimals) : "";
  const value = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${value}` : value;
}

/**
 * Whether a preview is complete enough to put in front of a signer. A
 * money-moving action must name an amount and (for a payment) a recipient. An
 * incomplete preview is a bug, not something to sign.
 */
export function previewIsComplete(preview: TransactionPreview): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!preview.programId) missing.push("program");
  if (!preview.feePayer) missing.push("fee payer");
  if (!preview.policyNote.trim()) missing.push("what this does");
  if (moneyMoves(preview.action)) {
    if (!preview.amount || preview.amount.minor === "0") missing.push("amount");
    else if (Number(preview.amount.decimals) < 0) missing.push("decimals");
  }
  if (actionPays(preview.action) && !preview.recipientOwner) missing.push("recipient");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/** Whether an action moves a token amount. */
export function moneyMoves(action: PreviewAction): boolean {
  return (
    action !== "billing.revoke" &&
    action !== "billing.create_vault" &&
    action !== "billing.create_plan" &&
    action !== "treasury.pause"
  );
}

/** Whether an action pays a recipient (needs an owner address shown). */
export function actionPays(action: PreviewAction): boolean {
  return action === "billing.withdraw" || action === "billing.collect" || action === "treasury.execute" || action === "treasury.exit";
}

/**
 * A single line for a confirmation screen, so the same summary is used
 * everywhere. Never includes a key or a secret.
 */
export function previewLine(preview: TransactionPreview): string {
  const parts: string[] = [preview.action];
  if (preview.amount) parts.push(`${formatMinor(preview.amount)} ${preview.amount.asset}`);
  if (preview.recipientOwner) parts.push(`to ${preview.recipientOwner}`);
  parts.push(`on ${preview.cluster}`);
  return parts.join(" ");
}
