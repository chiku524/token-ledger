import { describe, expect, it } from "vitest";
import { VENUES, VENUE_KEYS, venueDefinition } from "./registry";

describe("exchange venue registry", () => {
  it("lists the target venues", () => {
    expect(VENUE_KEYS).toEqual(["kraken", "bybit", "binance", "gate", "backpack"]);
  });

  it("gives every venue a label, a key URL, and read-only scopes", () => {
    for (const key of VENUE_KEYS) {
      const venue = VENUES[key]!;
      expect(venue.label.length).toBeGreaterThan(0);
      expect(venue.keyUrl).toMatch(/^https:\/\//);
      expect(venue.scopes.length).toBeGreaterThan(0);
      expect(venue.key).toBe(key);
    }
  });

  it("creates a connector per venue", () => {
    for (const key of VENUE_KEYS) {
      const connector = VENUES[key]!.create({ apiKey: "k", apiSecret: Buffer.alloc(32).toString("base64") });
      expect(typeof connector.fetchBalances).toBe("function");
      expect(typeof connector.fetchTransactions).toBe("function");
      expect(typeof connector.verify).toBe("function");
    }
  });

  it("returns null for an unknown venue", () => {
    expect(venueDefinition("coinbase")).toBeNull();
  });
});
