import { beforeEach, describe, expect, it, vi } from "vitest";

const inserts: { table: unknown; values: unknown }[] = [];

vi.mock("./client", () => {
  const tx = {
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserts.push({ table, values });
      },
    }),
  };
  return { getDb: () => ({ transaction: async (run: (tx: unknown) => Promise<void>) => run(tx) }) };
});

import { registerOrganization } from "./register";
import { entities, organizations, users } from "./schema";

const BASE = {
  ownerName: "Amina Rahman",
  email: "Amina@Example.com",
  passwordHash: "hash",
  organizationName: "Harbourline Digital",
  entityName: "Harbourline Digital Sdn. Bhd.",
  jurisdiction: "MY",
  functionalCurrency: "MYR",
  reportingFramework: "MFRS",
  connections: [],
};

function inserted(table: unknown): Record<string, unknown> {
  const row = inserts.find((entry) => entry.table === table);
  if (!row) throw new Error("Nothing was inserted into that table.");
  return row.values as Record<string, unknown>;
}

beforeEach(() => {
  inserts.length = 0;
});

describe("registerOrganization", () => {
  it("creates an organization account when no type is given", async () => {
    await registerOrganization(BASE);
    expect(inserted(organizations)).toMatchObject({ name: "Harbourline Digital", origin: "live", accountType: "organization" });
  });

  it("stores the account type an individual signs up with", async () => {
    await registerOrganization({
      ...BASE,
      accountType: "individual",
      organizationName: "Amina Rahman (Personal)",
      entityName: "Amina Rahman (Personal)",
      jurisdiction: "US",
      functionalCurrency: "USD",
    });
    expect(inserted(organizations)).toMatchObject({ name: "Amina Rahman (Personal)", accountType: "individual" });
  });

  it("gives an individual the same shape as an organization: one entity and one owner", async () => {
    await registerOrganization({ ...BASE, accountType: "individual" });
    expect(inserted(entities)).toMatchObject({ jurisdiction: "MY", functionalCurrency: "MYR", parentEntityId: null });
    expect(inserted(users)).toMatchObject({ email: "amina@example.com", role: "owner", status: "active" });
  });
});
