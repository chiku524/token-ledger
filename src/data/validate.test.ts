import { describe, expect, it } from "vitest";
import { entityFormSchema, firstIssue, journalFormSchema, sourceFormSchema } from "./validate";

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

    const wallet = sourceFormSchema.safeParse({
      entityId: "ent_1",
      kind: "wallet",
      role: "",
      name: "Ops",
      chain: "ethereum",
      identifier: "0xabc",
    });
    expect(wallet.success).toBe(false);
    if (!wallet.success) expect(firstIssue(wallet.error)).toContain("role");

    expect(
      sourceFormSchema.parse({
        entityId: "ent_1",
        kind: "exchange",
        role: "",
        name: "Desk",
        chain: "",
        identifier: "acct-1",
      }).role,
    ).toBeNull();
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
});
