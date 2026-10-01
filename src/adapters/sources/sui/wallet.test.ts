/**
 * End-to-end read of one Sui wallet through the public adapter surface:
 * assets held, observed balances, transactions, and the listed account.
 * Offline — the RPC is a fake, so this runs in CI.
 */
import { describe, expect, it, vi } from "vitest";
import { SuiChainAdapter } from "../chain";
import { SuiReader } from "./reader";
import type { SuiRpcClient } from "./rpc";

const WALLET = "0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

function fakeRpc(): SuiRpcClient {
  return {
    call: vi.fn(async (method: string) => {
      if (method === "suix_getAllBalances") {
        return [
          { coinType: "0x2::sui::SUI", coinObjectCount: 3, totalBalance: "1500000000" },
          { coinType: USDC, coinObjectCount: 1, totalBalance: "280009854" },
        ];
      }
      if (method === "suix_queryTransactionBlocks") {
        return {
          data: [
            {
              digest: "sui-digest-1",
              timestampMs: "1790826696940",
              balanceChanges: [
                { owner: { AddressOwner: WALLET }, coinType: "0x2::sui::SUI", amount: "-415216" },
              ],
            },
          ],
          nextCursor: null,
          hasNextPage: false,
        };
      }
      throw new Error(`unexpected method ${method}`);
    }),
  } as unknown as SuiRpcClient;
}

describe("reading a Sui wallet address", () => {
  const query = { since: "2025-10-01", until: "2026-10-02", externalAccountId: WALLET };
  const adapter = new SuiChainAdapter({ reader: new SuiReader(fakeRpc()) });

  it("returns the assets held as observed balances", async () => {
    const balances = await adapter.fetchBalances(query);
    expect(Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]))).toEqual({
      SUI: 1_500_000_000n,
      USDC: 280_009_854n,
    });
  });

  it("returns the transactions as movements", async () => {
    const movements = await adapter.fetchTransactions(query);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      assetCode: "SUI",
      direction: "out",
      quantityMinor: 415_216n,
      occurredOn: new Date(1790826696940).toISOString().slice(0, 10),
      chain: "sui",
    });
  });

  it("lists the account behind the wallet", async () => {
    await expect(adapter.listAccounts(query)).resolves.toEqual([
      { externalAccountId: WALLET, name: "Sui account", chain: "sui" },
    ]);
  });
});
