import { describe, expect, it } from "vitest";
import { assignSignupEntity, parseSignup } from "./signup";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const account = {
  name: "Amina Shah",
  email: "amina@example.com",
  password: "harbourline-signup-1",
  confirm: "harbourline-signup-1",
  organizationName: "North Desk",
  entityName: "North Desk Pte. Ltd.",
  jurisdiction: "sg",
  functionalCurrency: "SGD",
  reportingFramework: "IFRS",
};

describe("parseSignup", () => {
  it("treats a form with no account type as an organization", () => {
    const parsed = parseSignup(form(account));
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.value.accountType).toBe("organization");
    expect(parsed.value.company).toMatchObject({ organizationName: "North Desk", entityName: "North Desk Pte. Ltd.", jurisdiction: "SG" });
  });

  it("keeps requiring company details for an organization", () => {
    const parsed = parseSignup(form({ ...account, accountType: "organization", entityName: "" }));
    expect(parsed.ok).toBe(false);
  });

  it("refuses an account type it does not know", () => {
    const parsed = parseSignup(form({ ...account, accountType: "team" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toMatch(/individual or an organization/i);
  });

  it("names an individual's books after them and needs no company details", () => {
    const parsed = parseSignup(
      form({ name: account.name, email: account.email, password: account.password, confirm: account.confirm, accountType: "individual" }),
    );
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.value.accountType).toBe("individual");
    expect(parsed.value.company).toEqual({
      organizationName: "Amina Shah (Personal)",
      entityName: "Amina Shah (Personal)",
      jurisdiction: "US",
      functionalCurrency: "USD",
      reportingFramework: "IFRS",
    });
  });

  it("lets an individual pick a country and one of the three currencies", () => {
    const parsed = parseSignup(
      form({ ...account, accountType: "individual", organizationName: "ignored", entityName: "ignored", jurisdiction: "my", functionalCurrency: "MYR", reportingFramework: "MFRS" }),
    );
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.value.company).toMatchObject({ jurisdiction: "MY", functionalCurrency: "MYR", organizationName: "Amina Shah (Personal)", reportingFramework: "IFRS" });
  });

  it("refuses an individual's unsupported currency or malformed country", () => {
    expect(parseSignup(form({ ...account, accountType: "individual", functionalCurrency: "EUR" })).ok).toBe(false);
    expect(parseSignup(form({ ...account, accountType: "individual", jurisdiction: "Malaysia" })).ok).toBe(false);
  });

  it("accepts an account with no connections", () => {
    const parsed = parseSignup(form(account));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.company.jurisdiction).toBe("SG");
    expect(parsed.value.connections).toEqual([]);
  });

  it("accepts a wallet, an exchange, and a custodian together", () => {
    const parsed = parseSignup(
      form({
        ...account,
        walletEnabled: "on",
        walletName: "Ops wallet",
        walletChain: "ethereum",
        walletRole: "hot",
        walletIdentifier: "0xabc",
        exchangeEnabled: "on",
        exchangeName: "Desk",
        exchangeIdentifier: "acct-1",
        custodianEnabled: "on",
        custodianName: "Vault",
        custodianChain: "solana",
        custodianIdentifier: "vault-1",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.connections.map((draft) => draft.connection.mode)).toEqual([
      "watch",
      "exchange_read",
      "custodian_read",
    ]);
    expect(parsed.value.connections.every((draft) => draft.connection.scopes === "balances,movements")).toBe(true);
  });

  it("refuses a wallet that has no type", () => {
    const parsed = parseSignup(
      form({
        ...account,
        walletEnabled: "on",
        walletName: "Ops wallet",
        walletChain: "ethereum",
        walletIdentifier: "0xabc",
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toMatch(/wallet/i);
  });

  it("moves drafts onto the company that signup creates", () => {
    const parsed = parseSignup(
      form({
        ...account,
        walletEnabled: "on",
        walletName: "Ops wallet",
        walletChain: "ethereum",
        walletRole: "cold",
        walletIdentifier: "0xabc",
      }),
    );
    if (!parsed.ok) throw new Error(parsed.message);
    const [draft] = assignSignupEntity(parsed.value.connections, "ent_new");
    expect(draft?.connection.entityId).toBe("ent_new");
    expect(draft?.source.entityId).toBe("ent_new");
  });
});
