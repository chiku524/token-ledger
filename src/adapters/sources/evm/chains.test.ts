import { describe, expect, it } from "vitest";
import { EVM_CHAINS, evmChain } from "./chains";
import { resolveToken } from "./tokens";

describe("EVM chain config", () => {
  it("lists Ethereum and Polygon with the right ids and native currency", () => {
    expect(evmChain("ethereum")).toMatchObject({
      chainId: 1,
      nativeCode: "ETH",
      nativeDecimals: 18,
      alchemyNetwork: "eth-mainnet",
    });
    expect(evmChain("polygon")).toMatchObject({
      chainId: 137,
      nativeCode: "POL",
      nativeDecimals: 18,
      alchemyNetwork: "polygon-mainnet",
    });
    expect(EVM_CHAINS.size).toBe(2);
  });

  it("returns null for an unknown chain", () => {
    expect(evmChain("base")).toBeNull();
  });
});

describe("EVM token registry", () => {
  it("resolves a known token case-insensitively", () => {
    const ethereum = evmChain("ethereum")!;
    expect(resolveToken(ethereum, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toMatchObject({
      code: "USDC",
      decimals: 6,
    });
    expect(resolveToken(ethereum, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toMatchObject({ code: "USDC" });
  });

  it("treats the same token differently per chain and skips unknown", () => {
    const polygon = evmChain("polygon")!;
    const ethereum = evmChain("ethereum")!;
    // This USDC address exists on Polygon but not Ethereum's registry.
    expect(resolveToken(polygon, "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359")).toMatchObject({ code: "USDC" });
    expect(resolveToken(ethereum, "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359")).toBeNull();
    expect(resolveToken(ethereum, "0x0000000000000000000000000000000000000000")).toBeNull();
  });
});
