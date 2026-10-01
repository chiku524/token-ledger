import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BitGoBalancesResponse, BitGoTransfersResponse, BitGoWalletsResponse } from "./bitgo-responses";
import { bitgoAssetCode, coinNetwork, mapBitGoBalances, mapBitGoTransfers, mapBitGoWallets } from "./bitgo-map";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const balances = fixture<BitGoBalancesResponse>("bitgo-balances.json");
const wallets = fixture<BitGoWalletsResponse>("bitgo-wallets.json");
const transfers = fixture<BitGoTransfersResponse>("bitgo-transfers.json");
const observedAt = new Date("2026-06-30T00:00:00.000Z");

describe("bitgoAssetCode", () => {
  it("uppercases, strips a testnet prefix, and takes the base of a token key", () => {
    expect(bitgoAssetCode("btc")).toBe("BTC");
    expect(bitgoAssetCode("eth:usdc")).toBe("USDC");
    expect(bitgoAssetCode("tbtc")).toBe("BTC");
    expect(bitgoAssetCode("teth")).toBe("ETH");
    expect(bitgoAssetCode("sol")).toBe("SOL");
  });
});

describe("mapBitGoBalances", () => {
  it("sums balances by asset and skips zero balances", () => {
    const rows = mapBitGoBalances(balances, observedAt);
    const byCode = Object.fromEntries(rows.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.BTC).toBe(1_250_000_000n);
    expect(byCode.ETH).toBe(340_250_000_000_000_000_000n);
    expect(byCode.USDC).toBe(1_000_000_000n);
    expect(byCode.SOL).toBe(5_000_000_000n);
    // The zero-balance tbtc is skipped.
    expect(rows.every((row) => row.quantityMinor > 0n)).toBe(true);
    expect(rows.every((row) => row.asOf === observedAt.toISOString())).toBe(true);
  });

  it("lists wallets with the implied network", () => {
    const rows = mapBitGoWallets(balances);
    expect(coinNetwork("eth:usdc")).toBe("ETH");
    expect(coinNetwork("btc")).toBeNull();
    expect(rows.some((row) => row.assetCode === "USDC" && row.network === "ETH")).toBe(true);
    expect(rows.some((row) => row.assetCode === "BTC" && row.network === null)).toBe(true);
  });
});

describe("mapBitGoTransfers", () => {
  it("maps confirmed transfers and skips pending ones", () => {
    const movements = mapBitGoTransfers(transfers.transfers, "btc");
    // t3 is pending and excluded.
    expect(movements).toHaveLength(2);
    const incoming = movements.find((movement) => movement.externalId === "bitgo-t1");
    const outgoing = movements.find((movement) => movement.externalId === "bitgo-t2");
    expect(incoming).toMatchObject({ assetCode: "BTC", direction: "in", quantityMinor: 200_000_000n, occurredOn: "2024-09-01" });
    expect(outgoing).toMatchObject({ assetCode: "BTC", direction: "out", quantityMinor: 50_000_000n });
  });

  it("keeps the wallet list usable (change outputs are not doubled)", () => {
    // The send transfer has a change entry of 49,000,000; the total stays 50,000,000.
    const [outgoing] = mapBitGoTransfers(transfers.transfers.filter((transfer) => transfer.id === "t2"), "btc");
    expect(outgoing?.quantityMinor).toBe(50_000_000n);
    expect(wallets.wallets[0]?._wallet?.id).toBe("wallet-1");
  });
});
