import { describe, expect, it, vi } from "vitest";
import { isValidBitcoinAddress } from "./address";
import type { EsploraClient } from "./esplora";
import { BitcoinReader } from "./reader";

const ADDRESS = "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97";
const OTHER = "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun";

describe("isValidBitcoinAddress", () => {
  it("accepts base58 and bech32 mainnet forms", () => {
    expect(isValidBitcoinAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBe(true); // P2PKH
    expect(isValidBitcoinAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(true); // P2SH
    expect(isValidBitcoinAddress(ADDRESS)).toBe(true); // P2WPKH
    expect(isValidBitcoinAddress("bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr")).toBe(true); // P2TR
  });

  it("rejects malformed and non-string values", () => {
    expect(isValidBitcoinAddress("not-an-address")).toBe(false);
    expect(isValidBitcoinAddress("1")).toBe(false);
    expect(isValidBitcoinAddress("tb1qxyz")).toBe(false); // testnet
    expect(isValidBitcoinAddress(undefined)).toBe(false);
    expect(isValidBitcoinAddress(42)).toBe(false);
  });
});

describe("BitcoinReader", () => {
  it("reads the balance and validates before calling", async () => {
    const client = {
      get: vi.fn(async () => ({
        address: ADDRESS,
        chain_stats: { funded_txo_sum: 1000, spent_txo_sum: 400 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      })),
    } as unknown as EsploraClient;
    const reader = new BitcoinReader(client);
    const balances = await reader.fetchBalances(ADDRESS, new Date("2026-06-30T00:00:00.000Z"));
    expect(balances).toEqual([{ assetCode: "BTC", quantityMinor: 600n, asOf: "2026-06-30T00:00:00.000Z" }]);

    await expect(reader.fetchBalances("nope")).rejects.toThrow(/valid Bitcoin address/);
  });

  it("maps and date-filters transactions", async () => {
    const tx = (txid: string, time: number, received: number, spent: number) => ({
      txid,
      vin: spent
        ? [{ txid: "p", vout: 0, prevout: { scriptpubkey: "", scriptpubkey_address: ADDRESS, value: spent } }]
        : [{ txid: "p", vout: 0, prevout: { scriptpubkey: "", scriptpubkey_address: OTHER, value: 1 } }],
      vout: received
        ? [{ scriptpubkey: "", scriptpubkey_address: ADDRESS, value: received }]
        : [{ scriptpubkey: "", scriptpubkey_address: OTHER, value: 1 }],
      status: { confirmed: true, block_height: 1, block_time: time },
      fee: 0,
    });
    const client = {
      get: vi.fn(async () => [
        tx("tx-in", 1_760_000_000, 50_000, 0),
        tx("tx-out", 1_770_000_000, 0, 30_000),
      ]),
    } as unknown as EsploraClient;
    const reader = new BitcoinReader(client);

    const all = await reader.fetchTransactions(ADDRESS, "2020-01-01");
    expect(all.map((movement) => movement.direction).sort()).toEqual(["in", "out"]);
    expect(all[0]!.occurredOn >= all[1]!.occurredOn).toBe(true);

    const onlyLater = await reader.fetchTransactions(ADDRESS, "2026-01-01");
    expect(onlyLater).toHaveLength(1);
    expect(onlyLater[0]!.direction).toBe("out");
  });
});
