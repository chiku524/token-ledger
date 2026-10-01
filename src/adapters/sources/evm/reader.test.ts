import { describe, expect, it, vi } from "vitest";
import { evmChain } from "./chains";
import { EvmReader } from "./reader";
import type { EvmRpcClient } from "./rpc";

const ethereum = evmChain("ethereum")!;
const WATCHED = "0x28C6c06298d514Db089934071355E5743bf21d60";

function fakeClient(enhanced: boolean, overrides: Partial<Record<string, unknown>> = {}): EvmRpcClient {
  const outgoing = {
    blockNum: "0x1",
    uniqueId: "0xout:external",
    hash: "0xout",
    from: WATCHED,
    to: "0x1111111111111111111111111111111111111111",
    value: 1.5,
    asset: "ETH",
    category: "external",
    rawContract: { value: "0x14d1120d7b160000", address: null, decimal: "0x12" },
    metadata: { blockTimestamp: "2026-09-15T00:00:00.000Z" },
  };
  const incoming = {
    ...outgoing,
    uniqueId: "0xin:external",
    hash: "0xin",
    from: "0x2222222222222222222222222222222222222222",
    to: WATCHED,
  };
  const responses: Record<string, unknown> = {
    eth_getBalance: "0xde0b6b3a7640000",
    alchemy_getTokenBalances: {
      address: WATCHED.toLowerCase(),
      tokenBalances: [{ contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", tokenBalance: "0x1e8480" }],
    },
    ...overrides,
  };
  return {
    enhanced,
    call: vi.fn(async (method: string, params: unknown[] = []) => {
      if (method === "alchemy_getAssetTransfers") {
        const query = params[0] as { fromAddress?: string; toAddress?: string };
        return { transfers: query.fromAddress ? [outgoing] : [incoming] };
      }
      if (!(method in responses)) throw new Error(`unexpected method ${method}`);
      return responses[method];
    }),
  } as unknown as EvmRpcClient;
}

describe("EvmReader", () => {
  it("reads native and ERC-20 balances, normalizing the address", async () => {
    const client = fakeClient(true);
    const reader = new EvmReader(ethereum, client);
    const balances = await reader.fetchBalances(WATCHED, new Date("2026-06-30T00:00:00.000Z"));
    const byCode = Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.ETH).toBe(1_000_000_000_000_000_000n);
    expect(byCode.USDC).toBe(2_000_000n);
    // The registry contracts must be passed explicitly, not left to a top-N default.
    const tokenCall = (client.call as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
      (call) => call[0] === "alchemy_getTokenBalances",
    );
    expect((tokenCall?.[1] as [string, string[]])[1].length).toBeGreaterThan(0);
  });

  it("queries transfers in both directions and merges them", async () => {
    const client = fakeClient(true);
    const reader = new EvmReader(ethereum, client);
    await reader.fetchTransactions(WATCHED, "2026-01-01");
    const directions = (client.call as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter((call) => call[0] === "alchemy_getAssetTransfers")
      .map((call) => (call[1] as [Record<string, unknown>])[0]);
    expect(directions.some((query) => "fromAddress" in query && !("toAddress" in query))).toBe(true);
    expect(directions.some((query) => "toAddress" in query && !("fromAddress" in query))).toBe(true);
    expect(directions).toHaveLength(2);
  });

  it("reads only native when the endpoint is not enhanced", async () => {
    const client = fakeClient(false);
    const reader = new EvmReader(ethereum, client);
    const balances = await reader.fetchBalances(WATCHED);
    expect(balances.map((row) => row.assetCode)).toEqual(["ETH"]);
  });

  it("refuses transfers without an enhanced endpoint", async () => {
    const reader = new EvmReader(ethereum, fakeClient(false));
    await expect(reader.fetchTransactions(WATCHED, "2026-01-01")).rejects.toThrow(/enhanced endpoint/);
  });

  it("reads transfers in both directions and filters by date", async () => {
    const reader = new EvmReader(ethereum, fakeClient(true));
    const inRange = await reader.fetchTransactions(WATCHED, "2026-09-01", "2026-09-30");
    expect(inRange).toHaveLength(2);
    expect(inRange.map((movement) => movement.direction).sort()).toEqual(["in", "out"]);
    expect(inRange[0]).toMatchObject({ assetCode: "ETH", occurredOn: "2026-09-15" });
    const outOfRange = await reader.fetchTransactions(WATCHED, "2026-10-01", "2026-10-31");
    expect(outOfRange).toEqual([]);
  });

  it("rejects an invalid address before any call", async () => {
    const client = fakeClient(true);
    const reader = new EvmReader(ethereum, client);
    await expect(reader.fetchBalances("nope")).rejects.toThrow(/valid EVM address/);
    expect((client.call as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });
});
