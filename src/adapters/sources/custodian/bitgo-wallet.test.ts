/**
 * End-to-end read of a BitGo account through the public adapter surface:
 * balances and transfers. Offline — the client is faked, so this runs in CI.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BitGoCustodianAdapter } from "../custodian";
import { BitGoReader } from "./bitgo-reader";
import type { BitGoClient } from "./bitgo-client";
import type { BitGoBalancesResponse, BitGoTransfersResponse, BitGoWalletsResponse } from "./bitgo-responses";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const balances = fixture<BitGoBalancesResponse>("bitgo-balances.json");
const wallets = fixture<BitGoWalletsResponse>("bitgo-wallets.json");
const transfers = fixture<BitGoTransfersResponse>("bitgo-transfers.json");

function fakeClient(): BitGoClient {
  return {
    getBalances: async () => balances,
    getWallets: async () => wallets,
    getTransfers: async () => transfers,
  } as unknown as BitGoClient;
}

describe("reading a BitGo account", () => {
  const query = { since: "2024-08-01", until: "2024-09-30", externalAccountId: "btc" };
  const adapter = new BitGoCustodianAdapter({ reader: new BitGoReader(fakeClient()) });

  it("returns balances across coins", async () => {
    const rows = await adapter.fetchBalances(query);
    const byCode = Object.fromEntries(rows.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.BTC).toBe(1_250_000_000n);
    expect(byCode.USDC).toBe(1_000_000_000n);
  });

  it("returns transfers for the coin", async () => {
    const movements = await adapter.fetchTransactions(query);
    expect(movements.map((movement) => movement.externalId)).toEqual(["bitgo-t2", "bitgo-t1"]);
    expect(movements.every((movement) => movement.chain === "bitgo")).toBe(true);
  });

  it("lists the coin key behind the connection", async () => {
    await expect(adapter.listAccounts(query)).resolves.toEqual([
      { externalAccountId: "btc", name: "BitGo btc wallets", chain: undefined },
    ]);
  });

  it("requires a coin key", async () => {
    await expect(adapter.fetchBalances({ since: "2024-08-01" })).rejects.toThrow(/coin key/i);
  });
});
