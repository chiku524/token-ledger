/**
 * End-to-end read of one Solana wallet through the public adapter surface:
 * assets held, observed balances, transactions, and the listed account.
 * Offline — the RPC is a fake, so this runs in CI.
 */
import { describe, expect, it, vi } from "vitest";
import { SolanaChainAdapter } from "../chain";
import { SolanaReader } from "./reader";
import { DEFAULT_MINT_REGISTRY } from "./mints";
import type { SolanaRpcClient } from "./rpc";

const WALLET = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BLOCK_TIME = 1790823180;

/** A fake read-only RPC: knows just the four methods the reader calls. */
function fakeRpc(): SolanaRpcClient {
  const responses: Record<string, unknown> = {
    getBalance: { context: { slot: 1 }, value: 1_133_243_493_166_434 },
    getTokenAccountsByOwner: {
      context: { slot: 1 },
      value: [
        {
          pubkey: "token-account",
          account: {
            data: {
              program: "spl-token",
              parsed: {
                info: {
                  isNative: false,
                  mint: USDC_MINT,
                  owner: WALLET,
                  tokenAmount: { amount: "817778088916258", decimals: 6, uiAmount: 817778088.9, uiAmountString: "817778088" },
                },
              },
            },
          },
        },
      ],
    },
    getSignaturesForAddress: [
      { blockTime: BLOCK_TIME, confirmationStatus: "finalized", err: null, memo: null, signature: "sig-in", slot: 2 },
    ],
    getTransaction: {
      blockTime: BLOCK_TIME,
      slot: 2,
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000_000, 1],
        postBalances: [1_500_000_000, 1],
        preTokenBalances: [],
        postTokenBalances: [],
      },
      transaction: {
        message: {
          accountKeys: [
            { pubkey: WALLET, signer: true, writable: true },
            { pubkey: "11111111111111111111111111111111", signer: false, writable: true },
          ],
          instructions: [],
        },
      },
    },
  };

  return {
    call: vi.fn(async (method: string) => {
      if (!(method in responses)) throw new Error(`write/unexpected method ${method}`);
      return responses[method];
    }),
  } as unknown as SolanaRpcClient;
}

describe("reading a Solana wallet address", () => {
  const query = { since: "2026-09-01", until: "2026-10-02", externalAccountId: WALLET };
  const adapter = new SolanaChainAdapter({ reader: new SolanaReader(fakeRpc(), DEFAULT_MINT_REGISTRY) });

  it("returns the assets held as observed balances", async () => {
    const balances = await adapter.fetchBalances(query);
    const assets = balances.map((row) => row.assetCode).sort();
    expect(assets).toEqual(["SOL", "USDC"]);
    expect(Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]))).toEqual({
      SOL: 1_133_243_493_166_434n,
      USDC: 817_778_088_916_258n,
    });
  });

  it("returns the transactions as movements", async () => {
    const movements = await adapter.fetchTransactions(query);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      assetCode: "SOL",
      direction: "in",
      quantityMinor: 500_000_000n,
      occurredOn: new Date(BLOCK_TIME * 1000).toISOString().slice(0, 10),
      chain: "solana",
    });
  });

  it("lists the account behind the wallet", async () => {
    await expect(adapter.listAccounts(query)).resolves.toEqual([
      { externalAccountId: WALLET, name: "Solana account", chain: "solana" },
    ]);
  });

  it("never calls a write method", async () => {
    const client = fakeRpc();
    const reader = new SolanaReader(client, DEFAULT_MINT_REGISTRY);
    await new SolanaChainAdapter({ reader }).fetchBalances(query);
    const methods = (client.call as unknown as { mock: { calls: string[][] } }).mock.calls.map((call) => call[0]);
    expect(methods).not.toContain("sendTransaction");
  });
});
