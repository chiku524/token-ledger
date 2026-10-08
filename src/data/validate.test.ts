import { describe, expect, it } from "vitest";
import { connectionFormSchema, entityFormSchema, firstIssue, journalFormSchema, profileFormSchema } from "./validate";

describe("form validation", () => {
  it("accepts an entity and rejects a wallet without a role", () => {
    expect(
      entityFormSchema.parse({
        name: "Harbourline Digital Sdn. Bhd.",
        jurisdiction: "MY",
        functionalCurrency: "MYR",
        reportingFramework: "IFRS",
        parentEntityId: "",
      }).parentEntityId,
    ).toBeNull();

    const wallet = connectionFormSchema.safeParse({
      entityId: "ent_1",
      mode: "watch",
      role: "",
      name: "Ops",
      chain: "ethereum",
      identifier: "0xabc",
    });
    expect(wallet.success).toBe(false);
    if (!wallet.success) expect(firstIssue(wallet.error)).toContain("hot wallet");

    expect(
      connectionFormSchema.parse({
        entityId: "ent_1",
        mode: "exchange_read",
        role: "",
        name: "Desk",
        chain: "",
        identifier: "acct-1",
        exchangeVenue: "kraken",
      }).role,
    ).toBeNull();
  });

  it("requires an exchange venue and a complete key pair for an exchange", () => {
    const noVenue = connectionFormSchema.safeParse({
      entityId: "ent_1",
      mode: "exchange_read",
      role: "",
      name: "Desk",
      chain: "",
      identifier: "acct-1",
    });
    expect(noVenue.success).toBe(false);

    const halfKey = connectionFormSchema.safeParse({
      entityId: "ent_1",
      mode: "exchange_read",
      role: "",
      name: "Desk",
      chain: "",
      identifier: "acct-1",
      exchangeVenue: "kraken",
      apiKey: "only-key",
    });
    expect(halfKey.success).toBe(false);

    const ok = connectionFormSchema.safeParse({
      entityId: "ent_1",
      mode: "exchange_read",
      role: "",
      name: "Desk",
      chain: "",
      identifier: "acct-1",
      exchangeVenue: "kraken",
      apiKey: "key",
      apiSecret: "secret",
    });
    expect(ok.success).toBe(true);

    const coinbasePem = connectionFormSchema.safeParse({
      entityId: "ent_1",
      mode: "exchange_read",
      role: "",
      name: "Coinbase",
      chain: "",
      identifier: "main",
      exchangeVenue: "coinbase",
      apiKey: "organizations/00000000-0000-0000-0000-000000000000/apiKeys/11111111-1111-1111-1111-111111111111",
      apiSecret: `${"-----BEGIN EC PRIVATE KEY-----\n"}${"A".repeat(200)}\n-----END EC PRIVATE KEY-----\n`,
    });
    expect(coinbasePem.success).toBe(true);
  });

  it("requires a balanced-looking journal to have two lines, a date, and a name", () => {
    const parsed = journalFormSchema.safeParse({
      entityId: "ent_1",
      reference: "JE-1",
      entryDate: "2026-06-30",
        memo: "Capital",
        lines: [
        { accountCode: "1000", side: "debit", amount: "10.00" },
        { accountCode: "3100", side: "credit", amount: "10.00" },
      ],
    });
    expect(parsed.success).toBe(true);

    const missing = journalFormSchema.safeParse({
      entityId: "ent_1",
      reference: "JE-1",
      entryDate: "2026-06-30",
      memo: "Capital",
      lines: [{ accountCode: "1000", side: "debit", amount: "10.00" }],
    });
    expect(missing.success).toBe(false);
  });

  it("accepts a display name and rejects an empty one", () => {
    expect(profileFormSchema.safeParse({ name: "Sushmit Sarmah" }).success).toBe(true);
    expect(profileFormSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(profileFormSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
