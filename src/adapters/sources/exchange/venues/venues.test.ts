import { describe, expect, it, vi } from "vitest";
import { bybitVenue } from "./bybit";
import { binanceVenue } from "./binance";
import { gateVenue } from "./gate";
import { backpackVenue } from "./backpack";
import { geminiVenue } from "./gemini";
import { okxVenue } from "./okx";
import { kucoinVenue } from "./kucoin";
import { decimalsFor, toMinorUnits } from "../amounts";

const CRED = { apiKey: "test-key", apiSecret: "U5gMWjJpxW6/GNX/e4Qi4F7/hpQHjtQIaC55gBQKBDI=" };

/** Every venue must sign, read, and never touch a write route. */
const WRITE_PATHS = /order|withdraw\b(?!al|als|history|record|query)|cancel|transfer/i;

describe("exchange venues: read-only contract", () => {
  it("Bybit signs with the key headers and reads balances", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["X-BAPI-SIGN"]).toBeTruthy();
      expect((init?.headers as Record<string, string>)["X-BAPI-API-KEY"]).toBe("test-key");
      if (url.includes("/v5/account/wallet-balance")) {
        return new Response(
          JSON.stringify({ retCode: 0, retMsg: "OK", result: { list: [{ coin: [{ coin: "BTC", walletBalance: "0.5" }] }] } }),
          { status: 200 },
        );
      }
      if (url.includes("/v5/asset/transfer/query-account-coins-balance")) {
        return new Response(JSON.stringify({ retCode: 0, retMsg: "OK", result: { balance: [] } }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const connector = bybitVenue.create(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const balances = await connector.fetchBalances();
    expect(balances).toEqual([{ assetCode: "BTC", quantityMinor: 50_000_000n, asOf: expect.any(String) }]);
  });

  it("Bybit surfaces an auth failure", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ retCode: 10003, retMsg: "Invalid api key", result: {} }), { status: 200 }),
    );
    const connector = bybitVenue.create(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(connector.verify()).rejects.toThrow(/credential|Invalid api key/i);
  });

  it("Binance signs the query and reads balances", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/api/v3/account");
      expect(url).toContain("signature=");
      expect((init?.headers as Record<string, string>)["X-MBX-APIKEY"]).toBe("test-key");
      return new Response(JSON.stringify({ balances: [{ asset: "ETH", free: "1.5", locked: "0.5" }] }), { status: 200 });
    });
    const connector = binanceVenue.create(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const balances = await connector.fetchBalances();
    expect(balances[0]).toMatchObject({ assetCode: "ETH", quantityMinor: 2_000_000_000_000_000_000n });
  });

  it("Gate.io signs with the KEY/Timestamp/SIGN headers", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/spot/accounts");
      const headers = init?.headers as Record<string, string>;
      expect(headers.KEY).toBe("test-key");
      expect(headers.SIGN).toBeTruthy();
      expect(headers.Timestamp).toBeTruthy();
      return new Response(JSON.stringify([{ currency: "USDT", available: "10", locked: "5" }]), { status: 200 });
    });
    const connector = gateVenue.create(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const balances = await connector.fetchBalances();
    expect(balances[0]).toMatchObject({ assetCode: "USDT", quantityMinor: 15_000_000n });
  });

  it("Backpack signs with an ED25519 key and the right headers", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/api/v1/capital");
      const headers = init?.headers as Record<string, string>;
      expect(headers["X-API-Key"]).toBe("test-key");
      expect(headers["X-Signature"]).toBeTruthy();
      expect(headers["X-Timestamp"]).toBeTruthy();
      return new Response(JSON.stringify({ USDC: { available: "100.0", locked: "0" } }), { status: 200 });
    });
    const connector = backpackVenue.create(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const balances = await connector.fetchBalances();
    expect(balances[0]).toMatchObject({ assetCode: "USDC", quantityMinor: 100_000_000n });
  });

  it("Gemini signs an API key and reads balances", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/v1/balances");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["X-GEMINI-APIKEY"]).toBe("test-key");
      expect(headers["X-GEMINI-SIGNATURE"]).toBeTruthy();
      return new Response(JSON.stringify([{ currency: "BTC", amount: "0.25" }]), { status: 200 });
    });
    const connector = geminiVenue.create(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const balances = await connector.fetchBalances();
    expect(balances[0]).toMatchObject({ assetCode: "BTC", quantityMinor: 25_000_000n });
  });

  it("Gemini OAuth sends a bearer token and does not sign", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer access");
      expect(headers["X-GEMINI-SIGNATURE"]).toBeUndefined();
      return new Response(JSON.stringify([{ currency: "ETH", amount: "1" }]), { status: 200 });
    });
    const connector = geminiVenue.create(
      { apiKey: "access", apiSecret: "tl-oauth:refresh" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    const balances = await connector.fetchBalances();
    expect(balances[0]?.assetCode).toBe("ETH");
  });

  it("OKX signs with the passphrase header and reads balances", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/api/v5/account/balance");
      const headers = init?.headers as Record<string, string>;
      expect(headers["OK-ACCESS-KEY"]).toBe("test-key");
      expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("phrase");
      expect(headers["OK-ACCESS-SIGN"]).toBeTruthy();
      return new Response(JSON.stringify({ code: "0", data: [{ details: [{ ccy: "BTC", cashBal: "1" }] }] }), { status: 200 });
    });
    const connector = okxVenue.create({ ...CRED, apiPassphrase: "phrase" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const balances = await connector.fetchBalances();
    expect(balances[0]).toMatchObject({ assetCode: "BTC", quantityMinor: 100_000_000n });
  });

  it("KuCoin signs version 2 and sums account balances", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/api/v1/accounts");
      const headers = init?.headers as Record<string, string>;
      expect(headers["KC-API-KEY"]).toBe("test-key");
      expect(headers["KC-API-KEY-VERSION"]).toBe("2");
      expect(headers["KC-API-PASSPHRASE"]).toBeTruthy();
      expect(headers["KC-API-PASSPHRASE"]).not.toBe("phrase");
      return new Response(JSON.stringify({ code: "200000", data: [{ currency: "USDT", balance: "2" }, { currency: "USDT", balance: "3" }] }), { status: 200 });
    });
    const connector = kucoinVenue.create({ ...CRED, apiPassphrase: "phrase" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const balances = await connector.fetchBalances();
    expect(balances[0]).toMatchObject({ assetCode: "USDT", quantityMinor: 5_000_000n });
  });

  it("never issues a write-style request for any venue", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      return new Response("[]", { status: 200 });
    });
    for (const venue of [bybitVenue, binanceVenue, gateVenue, backpackVenue, geminiVenue, okxVenue, kucoinVenue]) {
      const credential = venue === okxVenue || venue === kucoinVenue ? { ...CRED, apiPassphrase: "phrase" } : CRED;
      const connector = venue.create(credential, { fetchImpl: fetchImpl as unknown as typeof fetch });
      await connector.verify().catch(() => undefined);
    }
    for (const url of seen) {
      expect(url).not.toMatch(WRITE_PATHS);
    }
  });
});

describe("shared amount helpers", () => {
  it("maps common asset decimals and converts exactly", () => {
    expect(decimalsFor("BTC")).toBe(8);
    expect(decimalsFor("USDC")).toBe(6);
    expect(decimalsFor("UNKNOWN", 4)).toBe(4);
    expect(toMinorUnits("1.5", 8)).toBe(150_000_000n);
    expect(toMinorUnits("-0.25", 6)).toBe(-250_000n);
  });
});
