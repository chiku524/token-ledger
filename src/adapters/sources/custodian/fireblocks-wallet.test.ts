/**
 * End-to-end read of a Fireblocks workspace through the public adapter surface:
 * balances and movements. Offline — the client is faked, so this runs in CI.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FireblocksCustodianAdapter } from "../custodian";
import { FireblocksReader } from "./fireblocks-reader";
import type { FireblocksClient } from "./fireblocks-client";
import type { FireblocksPagedVaultAccounts, FireblocksTransaction } from "./fireblocks-responses";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const accounts = fixture<FireblocksPagedVaultAccounts>("accounts.json");
const txs = fixture<FireblocksTransaction[]>("transactions.json");

function fakeClient(): FireblocksClient {
  return {
    getVaultAccounts: async () => accounts,
    getTransactions: async () => txs,
    getVaultAccount: async () => accounts.accounts[0]!,
  } as unknown as FireblocksClient;
}

describe("reading a Fireblocks workspace", () => {
  const query = { since: "2024-08-01", until: "2024-09-30", externalAccountId: "0" };
  const adapter = new FireblocksCustodianAdapter({ reader: new FireblocksReader(fakeClient()) });

  it("returns balances across vault accounts", async () => {
    const balances = await adapter.fetchBalances(query);
    const byCode = Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.BTC).toBe(10_050_000_000n);
    expect(byCode.USDC).toBe(1_000_000_000_000n);
  });

  it("returns movements for the vault account", async () => {
    const movements = await adapter.fetchTransactions(query);
    expect(movements.map((movement) => movement.externalId).sort()).toEqual(["fireblocks-tx-1", "fireblocks-tx-2"]);
    expect(movements.every((movement) => movement.chain === "fireblocks")).toBe(true);
  });

  it("lists the vault account behind the connection", async () => {
    await expect(adapter.listAccounts(query)).resolves.toEqual([
      { externalAccountId: "0", name: "Fireblocks vault 0", chain: undefined },
    ]);
  });

  it("requires a vault account id", async () => {
    await expect(adapter.fetchBalances({ since: "2024-08-01" })).rejects.toThrow(/vault account id/i);
  });
});
