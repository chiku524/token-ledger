/**
 * Map BitGo responses onto the ledger's normalized adapter types.
 *
 * BitGo reports balances and transfer values as base-unit integers in string
 * form (`balanceString`, `valueString`) — satoshis, wei, and so on — so they
 * convert to bigint directly with no scaling. Transfers are per coin and
 * wallet; a transfer's direction is its `type` (`receive`/`send`).
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { decimalsFor } from "../exchange/amounts";
import type { BitGoBalancesResponse, BitGoTransfer } from "./bitgo-responses";

/**
 * BitGo coin keys look like `btc`, testnet `tbtc`, or a token `eth:usdc`. The
 * ledger asset is the token symbol when present (USDC), otherwise the base
 * symbol (BTC); a testnet `t` prefix is stripped.
 */
export function bitgoAssetCode(coin: string): string {
  const [base, token] = coin.toLowerCase().split(":");
  const symbol = token ?? base!;
  const stripped = /^t[a-z]{2,}$/.test(symbol) ? symbol.slice(1) : symbol;
  return stripped.toUpperCase();
}

export function mapBitGoBalances(response: BitGoBalancesResponse, now: Date = new Date()): NormalizedBalance[] {
  const asOf = now.toISOString();
  const byCode = new Map<string, bigint>();
  for (const entry of response.balances ?? []) {
    const code = bitgoAssetCode(entry.coin);
    const amount = BigInt(entry.balanceString ?? "0");
    byCode.set(code, (byCode.get(code) ?? 0n) + amount);
  }
  return [...byCode]
    .filter(([, quantityMinor]) => quantityMinor !== 0n)
    .map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
}

/** A readable wallet row, with the network BitGo's coin key implies. */
export interface BitGoWalletRow {
  coin: string;
  assetCode: string;
  label: string | null;
  network: string | null;
  quantityMinor: bigint;
  decimals: number;
}

export function mapBitGoWallets(response: BitGoBalancesResponse): BitGoWalletRow[] {
  return (response.balances ?? []).map((entry) => {
    const code = bitgoAssetCode(entry.coin);
    return {
      coin: entry.coin,
      assetCode: code,
      label: entry.walletLabel ?? null,
      network: coinNetwork(entry.coin),
      quantityMinor: BigInt(entry.balanceString ?? "0"),
      decimals: decimalsFor(code),
    };
  });
}

/** The chain a BitGo coin belongs to, when it is a token (e.g. `eth:usdc` -> `ETH`). */
export function coinNetwork(coin: string): string | null {
  const [base, token] = coin.toLowerCase().split(":");
  if (token) return bitgoAssetCode(base!);
  return null;
}

export function mapBitGoTransfers(transfers: readonly BitGoTransfer[], coin: string): NormalizedSourceTransaction[] {
  const assetCode = bitgoAssetCode(coin);
  const movements: NormalizedSourceTransaction[] = [];
  for (const transfer of transfers) {
    const state = (transfer.state ?? "").toLowerCase();
    if (state && state !== "confirmed" && state !== "completed") continue;
    const ms = transfer.date ? Date.parse(transfer.date) : NaN;
    if (Number.isNaN(ms)) continue;

    const direction = transfer.type === "receive" ? "in" : "out";
    // BitGo reports base-unit integers as strings. Prefer the transfer total;
    // fall back to summing the non-change entries.
    const fromEntries = (transfer.entries ?? [])
      .filter((entry) => !entry.isChange)
      .reduce((sum, entry) => sum + BigInt(entry.valueString ?? "0"), 0n);
    const amount = transfer.valueString ? BigInt(transfer.valueString) : fromEntries;
    if (amount <= 0n) continue;

    movements.push({
      externalId: `bitgo-${transfer.id}`,
      occurredOn: new Date(ms).toISOString().slice(0, 10),
      assetCode,
      direction,
      quantityMinor: amount,
      description: direction === "in" ? "BitGo receipt." : "BitGo transfer.",
      chain: "bitgo",
    });
  }
  return movements;
}
