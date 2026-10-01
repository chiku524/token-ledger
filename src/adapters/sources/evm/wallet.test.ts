/**
 * End-to-end read of one EVM wallet through the public adapter surface: assets
 * held, observed balances, transactions, and the listed account. Offline — the
 * RPC is a fake, so this runs in CI.
 */
import { describe, expect, it, vi } from "vitest";
import { EthereumChainAdapter } from "../chain";
import { evmChain } from "./chains";
import { EvmReader } from "./reader";
import type { EvmRpcClient } from "./rpc";

const WALLET = "0x28C6c06298d514Db089934071355E5743bf21d60";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

function fakeRpc(): EvmRpcClient {
  const outgoing = {
    blockNum: "0x1",
    uniqueId: "0xout:erc20",
    hash: "0xout",
    from: WALLET,
    to: "0x1111111111111111111111111111111111111111",
    value: 100,
    asset: "USDC",
    category: "erc20",
    rawContract: { value: "0x5f5e100", address: USDC, decimal: "0x6" },
    metadata: { blockTimestamp: "2026-10-01T00:00:00.000Z" },
  };
  return {
    enhanced: true,
    call: vi.fn(async (method: string, params: unknown[] = []) => {
      if (method === "eth_getBalance") return "0xde0b6b3a7640000";
      if (method === "alchemy_getTokenBalances") {
        return { address: WALLET.toLowerCase(), tokenBalances: [{ contractAddress: USDC, tokenBalance: "0x1e8480" }] };
      }
      if (method === "alchemy_getAssetTransfers") {
        const query = params[0] as { fromAddress?: string };
        return { transfers: query.fromAddress ? [outgoing] : [] };
      }
      throw new Error(`unexpected method ${method}`);
    }),
  } as unknown as EvmRpcClient;
}

describe("reading an EVM wallet address", () => {
  const query = { since: "2026-09-01", until: "2026-10-31", externalAccountId: WALLET };
  const adapter = new EthereumChainAdapter({ reader: new EvmReader(evmChain("ethereum")!, fakeRpc()) });

  it("returns the assets held as observed balances", async () => {
    const balances = await adapter.fetchBalances(query);
    expect(Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]))).toEqual({
      ETH: 1_000_000_000_000_000_000n,
      USDC: 2_000_000n,
    });
  });

  it("returns the transactions as movements", async () => {
    const movements = await adapter.fetchTransactions(query);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      assetCode: "USDC",
      direction: "out",
      quantityMinor: 100_000_000n,
      occurredOn: "2026-10-01",
      chain: "ethereum",
    });
  });

  it("lists the account behind the wallet", async () => {
    await expect(adapter.listAccounts(query)).resolves.toEqual([
      { externalAccountId: WALLET, name: "Ethereum account", chain: "ethereum" },
    ]);
  });
});
