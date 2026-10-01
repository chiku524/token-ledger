import { describe, expect, it } from "vitest";
import { connectionFromForm, READ_ONLY_SCOPES } from "./connections";

describe("connectionFromForm", () => {
  it("maps a watch address to a pending wallet connection", () => {
    const draft = connectionFromForm({
      entityId: "ent_1",
      mode: "watch",
      name: "Cold",
      chain: "ethereum",
      role: "cold",
      identifier: "0xabc",
    });
    expect(draft.connection).toMatchObject({
      mode: "watch",
      venue: "ethereum",
      status: "pending",
      scopes: READ_ONLY_SCOPES,
    });
    expect(draft.source).toMatchObject({ kind: "wallet", role: "cold", chain: "ethereum", identifier: "0xabc" });
  });

  it("maps an exchange account without a network", () => {
    const draft = connectionFromForm({
      entityId: "ent_1",
      mode: "exchange_read",
      name: "Desk",
      chain: "ethereum",
      role: null,
      identifier: "acct-1",
    });
    expect(draft.connection.venue).toBe("exchange");
    expect(draft.source).toMatchObject({ kind: "exchange", role: null, chain: null });
  });

  it("accepts every supported watch chain, including Bitcoin and Sui", () => {
    for (const chain of ["ethereum", "solana", "polygon", "bitcoin", "sui"]) {
      const draft = connectionFromForm({
        entityId: "ent_1",
        mode: "watch",
        name: "Wallet",
        chain,
        role: "hot",
        identifier: "addr",
      });
      expect(draft.connection).toMatchObject({ mode: "watch", venue: chain });
    }
  });

  it("rejects a chain that is not supported", () => {
    expect(() =>
      connectionFromForm({ entityId: "ent_1", mode: "watch", name: "Wallet", chain: "dogecoin", role: "hot", identifier: "addr" }),
    ).toThrow(/supported chain/i);
  });

  it("keeps the chosen exchange venue", () => {
    for (const venue of ["kraken", "bybit", "binance", "gate", "backpack"]) {
      const draft = connectionFromForm({
        entityId: "ent_1",
        mode: "exchange_read",
        name: "Desk",
        chain: null,
        role: null,
        identifier: "acct-1",
        exchangeVenue: venue,
      });
      expect(draft.connection.venue).toBe(venue);
    }
  });

  it("keeps the chosen custodian venue", () => {
    const draft = connectionFromForm({
      entityId: "ent_1",
      mode: "custodian_read",
      name: "Vault",
      chain: null,
      role: null,
      identifier: "0",
      custodianVenue: "fireblocks",
    });
    expect(draft.connection).toMatchObject({ mode: "custodian_read", venue: "fireblocks", scopes: READ_ONLY_SCOPES });
  });

  it("rejects an unknown exchange venue", () => {
    expect(() =>
      connectionFromForm({
        entityId: "ent_1",
        mode: "exchange_read",
        name: "Desk",
        chain: null,
        role: null,
        identifier: "acct-1",
        exchangeVenue: "coinbase",
      }),
    ).toThrow(/choose an exchange/i);
  });

  it("maps a custodian vault and keeps an optional network", () => {
    const draft = connectionFromForm({
      entityId: "ent_1",
      mode: "custodian_read",
      name: "Vault",
      chain: "solana",
      role: null,
      identifier: "vault-1",
    });
    expect(draft.connection).toMatchObject({ mode: "custodian_read", venue: "custodian", scopes: READ_ONLY_SCOPES });
    expect(draft.source).toMatchObject({ kind: "custodian", chain: "solana" });
  });
});
