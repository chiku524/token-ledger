/**
 * Turn one confirmed Solana transaction into ledger movements for a watched
 * address. A transaction produces at most one movement per asset, derived from
 * the net change of that asset for the address, so a self-transfer does not
 * double count and the network fee is included in the native SOL delta.
 *
 * The external id is `<signature>:<asset>`, unique per movement, which the
 * source-transaction unique index requires.
 */
import type { NormalizedSourceTransaction } from "../../types";
import { SOL_CODE, resolveMint, type SolanaMint } from "./mints";
import type { ParsedTransaction, TokenBalanceEntry } from "./solana-responses";

export function mapTransactionToMovements(
  signature: string,
  tx: ParsedTransaction,
  watchedAddress: string,
  registry?: ReadonlyMap<string, SolanaMint>,
): NormalizedSourceTransaction[] {
  const meta = tx.meta;
  if (!meta || meta.err !== null) return [];
  if (tx.blockTime === null) return [];

  const keys = tx.transaction.message.accountKeys.map((key) => key.pubkey);
  const index = keys.indexOf(watchedAddress);
  if (index === -1) return [];

  const deltas = new Map<string, bigint>();

  const pre = BigInt(meta.preBalances[index] ?? 0);
  const post = BigInt(meta.postBalances[index] ?? 0);
  if (post !== pre) deltas.set(SOL_CODE, post - pre);

  const preTokens = tokenAmounts(meta.preTokenBalances);
  for (const entry of meta.postTokenBalances) {
    if (keys[entry.accountIndex] !== watchedAddress) continue;
    const resolved = resolveMint(entry.mint, registry);
    if (!resolved) continue;
    const before = preTokens.get(`${entry.accountIndex}:${entry.mint}`) ?? 0n;
    const delta = BigInt(entry.uiTokenAmount.amount) - before;
    if (delta !== 0n) deltas.set(resolved.code, (deltas.get(resolved.code) ?? 0n) + delta);
  }

  const occurredOn = new Date(tx.blockTime * 1000).toISOString().slice(0, 10);
  const movements: NormalizedSourceTransaction[] = [];
  for (const [assetCode, delta] of deltas) {
    if (delta === 0n) continue;
    const direction = delta > 0n ? "in" : "out";
    movements.push({
      externalId: `${signature}:${assetCode}`,
      occurredOn,
      assetCode,
      direction,
      quantityMinor: delta > 0n ? delta : -delta,
      description: direction === "in" ? `Solana receipt of ${assetCode}.` : `Solana transfer of ${assetCode}.`,
      chain: "solana",
    });
  }
  return movements;
}

function tokenAmounts(entries: TokenBalanceEntry[]): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const entry of entries ?? []) {
    map.set(`${entry.accountIndex}:${entry.mint}`, BigInt(entry.uiTokenAmount.amount));
  }
  return map;
}
