/**
 * End-to-end read of one Sui wallet through the public adapter surface:
 * assets held, observed balances, transactions, and the listed account.
 * Offline — the GraphQL client is a fake, so this runs in CI.
 */
import { describe, expect, it, vi } from "vitest";
import { SuiChainAdapter } from "../chain";
import { SuiReader } from "./reader";
import type { SuiGraphqlClient } from "./rpc";

const WALLET = "0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3";
const SUI_TYPE = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

/** A fake GraphQL client: answers the two queries by name. */
function fakeClient(): SuiGraphqlClient {
  return {
    query: vi.fn(async (query: string) => {
      if (query.includes("SuiBalances")) {
        return {
          address: {
            balances: {
              nodes: [
                { coinType: { repr: SUI_TYPE }, totalBalance: "1500000000" },
                { coinType: { repr: USDC_TYPE }, totalBalance: "280009854" },
              ],
            },
          },
        };
      }
      if (query.includes("SuiTransactions")) {
        return {
          address: {
            transactions: {
              pageInfo: { hasPreviousPage: false, startCursor: null },
              nodes: [
                {
                  digest: "sui-digest-1",
                  effects: {
                    timestamp: "2026-10-01T03:58:38.255Z",
                    balanceChanges: { nodes: [{ owner: { address: WALLET }, coinType: { repr: SUI_TYPE }, amount: "-415216" }] },
                  },
                },
              ],
            },
          },
        };
      }
      throw new Error(`unexpected query ${query}`);
    }),
  } as unknown as SuiGraphqlClient;
}

describe("reading a Sui wallet address", () => {
  const query = { since: "2025-10-01", until: "2026-10-02", externalAccountId: WALLET };
  const adapter = new SuiChainAdapter({ reader: new SuiReader(fakeClient()) });

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
      occurredOn: "2026-10-01",
      chain: "sui",
    });
  });

  it("lists the account behind the wallet", async () => {
    await expect(adapter.listAccounts(query)).resolves.toEqual([
      { externalAccountId: WALLET, name: "Sui account", chain: "sui" },
    ]);
  });
});
