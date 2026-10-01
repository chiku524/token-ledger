import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FireblocksPagedVaultAccounts, FireblocksTransaction } from "./fireblocks-responses";
import { mapFireblocksBalances, mapFireblocksTransactions, mapFireblocksWallets } from "./fireblocks-map";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const accounts = fixture<FireblocksPagedVaultAccounts>("accounts.json").accounts;
const txs = fixture<FireblocksTransaction[]>("transactions.json");
const observedAt = new Date("2026-06-30T00:00:00.000Z");

describe("mapFireblocksBalances", () => {
  it("sums each asset across vault accounts and skips zeros", () => {
    const balances = mapFireblocksBalances(accounts, observedAt);
    const byCode = Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.BTC).toBe(10_050_000_000n); // 12.5 + 88.0 at 8 dp
    expect(byCode.ETH).toBe(340_250_000_000_000_000_000n); // 340.25 at 18 dp
    expect(byCode.USDC).toBe(1_000_000_000_000n); // 1,000,000 at 6 dp
    expect(byCode.SOL).toBe(5_000_000_000_000n); // 5000 at 9 dp
    expect(balances.every((row) => row.asOf === observedAt.toISOString())).toBe(true);
  });

  it("lists wallets with the network Fireblocks reports", () => {
    const wallets = mapFireblocksWallets(accounts);
    const btc = wallets.find((wallet) => wallet.vaultAccountId === "0" && wallet.assetCode === "BTC");
    expect(btc).toMatchObject({ name: "Primary Trading", network: "BTC", decimals: 8 });
    const sol = wallets.find((wallet) => wallet.assetCode === "SOL");
    expect(sol).toMatchObject({ vaultAccountId: "12", network: "SOL" });
  });

  it("allows an asset with no network", () => {
    const wallets = mapFireblocksWallets([{ id: "9", name: "Fiat", assets: [{ id: "USD", total: "1000.00" }] }]);
    expect(wallets[0]).toMatchObject({ assetCode: "USD", network: null });
  });
});

describe("mapFireblocksTransactions", () => {
  it("maps completed inbound and outbound transactions for the vault", () => {
    const movements = mapFireblocksTransactions(txs, "0");
    // tx-3 is SUBMITTED, so it is not a movement yet.
    expect(movements).toHaveLength(2);
    const incoming = movements.find((movement) => movement.externalId === "fireblocks-tx-1");
    const outgoing = movements.find((movement) => movement.externalId === "fireblocks-tx-2");
    expect(incoming).toMatchObject({ assetCode: "BTC", direction: "in", quantityMinor: 200_000_000n });
    expect(outgoing).toMatchObject({ assetCode: "ETH", direction: "out", quantityMinor: 5_000_000_000_000_000_000n });
  });

  it("ignores transactions that do not involve the vault", () => {
    expect(mapFireblocksTransactions(txs, "999")).toEqual([]);
  });
});
