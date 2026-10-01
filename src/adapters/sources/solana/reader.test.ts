import { describe, expect, it, vi } from "vitest";
import { SolanaReader } from "./reader";
import type { SolanaRpcClient } from "./rpc";

const ADDRESS = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const OTHER = "4i9hvJfB2StTgnb5ekEW44tH66FfTb4SKf8QUEfVWWvS";

/**
 * A fake client that answers the four read methods from in-memory data. It
 * fails the test if any other method (for example a write) is called.
 */
function fakeClient(overrides: Partial<Record<string, unknown>> = {}): SolanaRpcClient {
  const blockTime = 1790823180;
  const responses: Record<string, unknown> = {
    getBalance: { context: { slot: 1 }, value: 1134291886284049 },
    getTokenAccountsByOwner: { context: { slot: 1 }, value: [] },
    getSignaturesForAddress: [
      { blockTime, confirmationStatus: "finalized", err: null, memo: null, signature: "sig-keep", slot: 10 },
      { blockTime, confirmationStatus: "finalized", err: { InstructionError: [0, "x"] }, memo: null, signature: "sig-failed", slot: 9 },
    ],
    getTransaction: {
      blockTime,
      slot: 10,
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1000, 1],
        postBalances: [1, 1],
        preTokenBalances: [],
        postTokenBalances: [],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: ADDRESS, signer: true, writable: true },
            { pubkey: OTHER, signer: false, writable: true },
          ],
          instructions: [],
        },
      },
    },
    ...overrides,
  };

  return {
    call: vi.fn(async (method: string) => {
      if (!(method in responses)) throw new Error(`unexpected method ${method}`);
      return responses[method];
    }),
  } as unknown as SolanaRpcClient;
}

describe("SolanaReader", () => {
  it("reads balances for the watched address", async () => {
    const reader = new SolanaReader(fakeClient());
    await expect(reader.fetchBalances(ADDRESS, new Date("2026-06-30T00:00:00.000Z"))).resolves.toEqual([
      { assetCode: "SOL", quantityMinor: 1134291886284049n, asOf: "2026-06-30T00:00:00.000Z" },
    ]);
  });

  it("only reads confirmed, in-range transactions and ignores failures", async () => {
    const client = fakeClient();
    const reader = new SolanaReader(client);
    const movements = await reader.fetchTransactions(ADDRESS, "2026-01-01", "2026-12-31");
    expect(movements).toHaveLength(1);
    const calledMethods = (client.call as unknown as { mock: { calls: string[][] } }).mock.calls.map((call) => call[0]);
    expect(calledMethods).not.toContain("sendTransaction");
    expect(new Set(calledMethods)).toEqual(new Set(["getSignaturesForAddress", "getTransaction"]));
  });

  it("rejects an invalid address before any call", async () => {
    const client = fakeClient();
    const reader = new SolanaReader(client);
    await expect(reader.fetchBalances("not-an-address")).rejects.toThrow(/valid Solana address/);
    expect((client.call as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });
});
