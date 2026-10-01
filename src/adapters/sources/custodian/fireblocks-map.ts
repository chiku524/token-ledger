/**
 * Map Fireblocks responses onto the ledger's normalized adapter types.
 *
 * A vault wallet is `(vaultAccountId, assetId)`. `total` is the balance. The
 * network is the asset's `blockchain` when Fireblocks reports one, otherwise
 * null (as the port allows). A transaction's direction is decided by whether
 * the vault is the source or the destination.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { decimalsFor, toMinorUnits } from "../exchange/amounts";
import type { FireblocksTransaction, FireblocksVaultAccount } from "./fireblocks-responses";

export function mapFireblocksBalances(accounts: readonly FireblocksVaultAccount[], now: Date = new Date()): NormalizedBalance[] {
  const asOf = now.toISOString();
  const rows = new Map<string, bigint>();
  for (const account of accounts) {
    for (const asset of account.assets ?? []) {
      const amount = toMinorUnits(asset.total ?? asset.balance ?? "0", decimalsFor(asset.id));
      rows.set(asset.id, (rows.get(asset.id) ?? 0n) + amount);
    }
  }
  return [...rows]
    .filter(([, quantityMinor]) => quantityMinor !== 0n)
    .map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
}

/** A readable wallet row, including the network when Fireblocks reports one. */
export interface FireblocksWallet {
  vaultAccountId: string;
  name: string;
  assetCode: string;
  network: string | null;
  quantityMinor: bigint;
  decimals: number;
}

export function mapFireblocksWallets(accounts: readonly FireblocksVaultAccount[]): FireblocksWallet[] {
  const wallets: FireblocksWallet[] = [];
  for (const account of accounts) {
    for (const asset of account.assets ?? []) {
      const decimals = decimalsFor(asset.id);
      wallets.push({
        vaultAccountId: account.id,
        name: account.name,
        assetCode: asset.id,
        network: asset.blockchain ? asset.blockchain.toUpperCase() : null,
        quantityMinor: toMinorUnits(asset.total ?? asset.balance ?? "0", decimals),
        decimals,
      });
    }
  }
  return wallets;
}

const INBOUND_STATES = new Set(["COMPLETED", "CONFIRMED"]);

export function mapFireblocksTransactions(
  transactions: readonly FireblocksTransaction[],
  vaultAccountId: string,
): NormalizedSourceTransaction[] {
  const movements: NormalizedSourceTransaction[] = [];
  for (const tx of transactions) {
    if (!INBOUND_STATES.has(tx.state ?? tx.status)) continue;
    const ms = (tx.lastUpdated ?? tx.createdAt ?? 0) * 1000;
    if (ms <= 0) continue;
    const fromVault = tx.source?.id === vaultAccountId;
    const toVault = tx.destination?.id === vaultAccountId;
    if (!fromVault && !toVault) continue;
    const direction = toVault && !fromVault ? "in" : "out";
    // Fireblocks reports `amount` as a signed number in major units.
    const amount = toMinorUnits(Math.abs(tx.amount).toString(), decimalsFor(tx.assetId));
    if (amount === 0n) continue;
    movements.push({
      externalId: `fireblocks-${tx.id}`,
      occurredOn: new Date(ms).toISOString().slice(0, 10),
      assetCode: tx.assetId,
      direction,
      quantityMinor: amount,
      description: direction === "in" ? "Fireblocks receipt." : "Fireblocks transfer.",
      chain: "fireblocks",
    });
  }
  return movements;
}
