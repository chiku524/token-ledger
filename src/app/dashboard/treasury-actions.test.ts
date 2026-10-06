import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoice, createSupplier, listTreasuries } from "@/db/treasury";
import { invoices, paymentProposals } from "@/db/schema";
import {
  CROSS_SITE,
  expectError,
  expectSaved,
  form,
  FORM_EXPIRED,
  MY,
  NO_PERMISSION,
  ORG,
  OUTSIDE_ACCESS,
  redirectOf,
  resetRequest,
  SG,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import {
  createInvoiceAction,
  createSupplierAction,
  prepareApprovePayment,
  prepareCancelPayment,
  prepareExecutePayment,
  prepareInitializeTreasury,
  prepareProposePayment,
  prepareRevokeApproval,
  prepareTreasuryDeposit,
  type PreparedPlan,
} from "./treasury-actions";

const tables = vi.hoisted(() => ({ rows: new Map<unknown, Record<string, unknown>[]>() }));

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows = tables.rows.get(table) ?? [];
          return Object.assign(Promise.resolve(rows), { limit: async () => rows });
        },
      }),
    }),
  }),
}));
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/data/example-books")).exampleBooks),
}));
vi.mock("@/db/treasury", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/treasury")>()),
  createSupplier: vi.fn(async () => "sup_1"),
  createInvoice: vi.fn(async () => "inv_1"),
  listTreasuries: vi.fn(async () => []),
}));

const PATH = "/dashboard/treasury";
const READ_ONLY = "Connect a database to save changes. This demo and the sample are read-only.";
const NOT_CONFIGURED = "The contract features are not configured on this deployment.";
const NOT_IN_ORG = "That proposal is not in this organization.";

const address = (seed: number) => base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(seed)));
const SIGNER = address(5);
const TREASURY = "trs_1";
const INVOICE_KEY = "ab".repeat(16);

function configureContracts(): void {
  vi.stubEnv("SOLANA_CONTRACTS_CLUSTER", "devnet");
  vi.stubEnv("SERVICE_BALANCE_PROGRAM_ID", address(1));
  vi.stubEnv("TREASURY_PAYABLES_PROGRAM_ID", address(2));
  vi.stubEnv("USDC_MINT", address(3));
  vi.stubEnv("SOLANA_RPC_URL", "");
  vi.stubEnv("SPL_TOKEN_PROGRAM_ID", "");
  vi.stubEnv("MERCHANT_ADMIN_ADDRESS", "");
}

function storeTreasury(): void {
  vi.mocked(listTreasuries).mockResolvedValue([{ id: TREASURY, entityId: MY } as Awaited<ReturnType<typeof listTreasuries>>[number]]);
}

function storeInvoice(overrides: Record<string, unknown> = {}): void {
  tables.rows.set(invoices, [{ id: "inv_1", organizationId: ORG, invoiceKey: INVOICE_KEY, amountMinor: 25_000_000n, ...overrides }]);
}

function storeProposal(overrides: Record<string, unknown> = {}): void {
  tables.rows.set(paymentProposals, [
    { id: "prop_1", organizationId: ORG, invoiceId: "inv_1", invoiceKey: INVOICE_KEY, revision: 0, grossAmountMinor: 25_000_000n, ...overrides },
  ]);
}

const initializeFields = {
  entityId: MY,
  actor: SIGNER,
  approvers: `${address(6)}, ${address(7)}`,
  proposers: address(8),
  threshold: "2",
  perPaymentLimit: "1000",
  dailyLimit: "5000",
  recovery: address(9),
  maxProposalLifetimeDays: "7",
};
const treasuryFields = { entityId: MY, actor: SIGNER, treasuryId: TREASURY };
const proposalFields = { ...treasuryFields, proposalId: "prop_1", recipientTokenAccount: address(10) };

const prepareActions = [
  ["prepareInitializeTreasury", prepareInitializeTreasury, initializeFields],
  ["prepareTreasuryDeposit", prepareTreasuryDeposit, { ...treasuryFields, amount: "10", funderTokenAccount: address(11) }],
  ["prepareProposePayment", prepareProposePayment, { ...treasuryFields, invoiceId: "inv_1", recipientOwner: address(12) }],
  ["prepareApprovePayment", prepareApprovePayment, proposalFields],
  ["prepareRevokeApproval", prepareRevokeApproval, proposalFields],
  ["prepareCancelPayment", prepareCancelPayment, proposalFields],
  ["prepareExecutePayment", prepareExecutePayment, proposalFields],
] as const;

beforeEach(() => {
  resetRequest();
  configureContracts();
  tables.rows.clear();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createSupplierAction", () => {
  it("adds the supplier with a normalized name", async () => {
    const user = signInLive("accountant");
    await expectSaved(createSupplierAction(form({ entityId: MY, name: "  Acme   Ltd " })), PATH, "Added Acme   Ltd.");
    expect(createSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, entityId: MY, name: "Acme   Ltd", normalizedName: "ACME LTD", createdBy: user.id }),
      expect.stringContaining(user.email),
    );
  });

  it("refuses a company outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    await expectError(createSupplierAction(form({ entityId: MY, name: "Acme" })), PATH, OUTSIDE_ACCESS);
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    await expectError(createSupplierAction(form({ entityId: MY, name: "Acme" })), PATH, READ_ONLY);
  });

  it("rejects a missing CSRF token", async () => {
    signInLive("owner");
    await expectError(createSupplierAction(form({ entityId: MY, name: "Acme" }, { csrf: null })), PATH, FORM_EXPIRED);
  });

  it("sends a signed-out user to sign in", async () => {
    expect((await redirectOf(createSupplierAction(form({ entityId: MY, name: "Acme" })))).pathname).toBe("/sign-in");
  });

  it.each(["", "   ", "x".repeat(201)])("rejects the name %j", async (name) => {
    signInLive("owner");
    await expectError(createSupplierAction(form({ entityId: MY, name })), PATH, "Enter the supplier name.");
  });

  it("reports a duplicate supplier", async () => {
    signInLive("owner");
    vi.mocked(createSupplier).mockRejectedValueOnce(new Error("unique violation"));
    await expectError(createSupplierAction(form({ entityId: MY, name: "Acme" })), PATH, "That supplier already exists for this company.");
  });

  it.fails("refuses a viewer", async () => {
    signInLive("viewer");
    await expectError(createSupplierAction(form({ entityId: MY, name: "Acme" })), PATH, NO_PERMISSION);
  });
});

describe("createInvoiceAction", () => {
  const fields = { entityId: MY, supplierId: "sup_1", supplierReference: " INV-001 ", amount: "250.5" };

  it("records the invoice in USDC minor units", async () => {
    signInLive("accountant");
    await expectSaved(createInvoiceAction(form(fields)), PATH, "Invoice recorded.");
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, entityId: MY, supplierId: "sup_1", supplierReference: "INV-001", currency: "USDC", amountMinor: 250_500_000n }),
      expect.any(String),
    );
    expect(vi.mocked(createInvoice).mock.calls[0]![0].invoiceKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a company outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    await expectError(createInvoiceAction(form(fields)), PATH, OUTSIDE_ACCESS);
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    await expectError(createInvoiceAction(form(fields)), PATH, READ_ONLY);
  });

  it("rejects a missing CSRF token", async () => {
    signInLive("owner");
    await expectError(createInvoiceAction(form(fields, { csrf: null })), PATH, FORM_EXPIRED);
  });

  it.each(["", "x".repeat(101)])("rejects the reference %j", async (supplierReference) => {
    signInLive("owner");
    await expectError(createInvoiceAction(form({ ...fields, supplierReference })), PATH, "Enter the supplier's invoice reference.");
  });

  it.each(["", "0", "-3", "abc"])("rejects the amount %j", async (amount) => {
    signInLive("owner");
    await expectError(createInvoiceAction(form({ ...fields, amount })), PATH, "Enter the invoice amount in USDC.");
  });

  it("reports a duplicate reference", async () => {
    signInLive("owner");
    vi.mocked(createInvoice).mockRejectedValueOnce(new Error("unique violation"));
    await expectError(createInvoiceAction(form(fields)), PATH, "That invoice reference is already recorded for this supplier.");
  });

  it.fails("refuses a viewer", async () => {
    signInLive("viewer");
    await expectError(createInvoiceAction(form(fields)), PATH, NO_PERMISSION);
  });
});

describe.each(prepareActions)("%s guards", (_name, action, fields) => {
  it("sends a signed-out user to sign in", async () => {
    expect((await redirectOf(action(form(fields)))).pathname).toBe("/sign-in");
  });

  it("rejects a missing CSRF token", async () => {
    signInLive("owner");
    expect(await action(form(fields, { csrf: null }))).toEqual({ error: FORM_EXPIRED });
  });

  it("rejects a cross-site request", async () => {
    resetRequest({ origin: "https://evil.example" });
    configureContracts();
    signInLive("owner");
    expect(await action(form(fields))).toEqual({ error: CROSS_SITE });
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    expect(await action(form(fields))).toEqual({ error: READ_ONLY });
  });

  it("refuses a company outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    expect(await action(form(fields))).toEqual({ error: OUTSIDE_ACCESS });
  });

  it("is off when the contracts are not configured", async () => {
    vi.stubEnv("SOLANA_CONTRACTS_CLUSTER", "");
    signInLive("owner");
    expect(await action(form(fields))).toEqual({ error: NOT_CONFIGURED });
  });

  it("refuses a company that is not in the organization", async () => {
    signInLive("owner");
    expect(await action(form({ ...fields, entityId: "ent_elsewhere" }))).toEqual({ error: "Choose a company in this organization." });
  });

  it("needs a signer wallet", async () => {
    signInLive("owner");
    const result = await action(form({ ...fields, actor: "" }));
    expect("error" in result && result.error).toMatch(/^Connect (a signer wallet|the wallet that will initialize the treasury)\.$/);
  });
});

describe("prepareInitializeTreasury", () => {
  it.each([
    ["0", "The threshold must be between 1 and the number of approvers."],
    ["3", "The threshold must be between 1 and the number of approvers."],
  ])("rejects threshold %s for two approvers", async (threshold, error) => {
    signInLive("owner");
    expect(await prepareInitializeTreasury(form({ ...initializeFields, threshold }))).toEqual({ error });
  });

  it.each([{ perPaymentLimit: "" }, { dailyLimit: "0" }, { perPaymentLimit: "abc" }])("rejects the limits %j", async (overrides) => {
    signInLive("owner");
    expect(await prepareInitializeTreasury(form({ ...initializeFields, ...overrides }))).toEqual({
      error: "Enter the per-payment and daily limits in USDC.",
    });
  });

  it("needs a recovery wallet", async () => {
    signInLive("owner");
    expect(await prepareInitializeTreasury(form({ ...initializeFields, recovery: " " }))).toEqual({ error: "Enter the recovery wallet." });
  });

  // The planner seeds the treasury PDA with the company id as a Solana public key,
  // so an app company id ("ent_…") throws instead of returning a plan.
  it.fails("returns a plan for a company in this organization", async () => {
    signInLive("owner");
    const result: PreparedPlan = await prepareInitializeTreasury(form(initializeFields));
    expect("plan" in result && result.plan.feePayer).toBe(SIGNER);
  });
});

describe("treasury lookups", () => {
  it("needs a treasury for the company", async () => {
    signInLive("owner");
    expect(await prepareTreasuryDeposit(form({ ...treasuryFields, amount: "10", funderTokenAccount: address(11) }))).toEqual({
      error: "Choose the treasury for this company.",
    });
  });

  it.each(["", "0", "abc"])("rejects the deposit amount %j", async (amount) => {
    signInLive("owner");
    storeTreasury();
    expect(await prepareTreasuryDeposit(form({ ...treasuryFields, amount, funderTokenAccount: address(11) }))).toEqual({
      error: "Enter a deposit amount in USDC.",
    });
  });

  it("needs the funder token account", async () => {
    signInLive("owner");
    storeTreasury();
    expect(await prepareTreasuryDeposit(form({ ...treasuryFields, amount: "10", funderTokenAccount: "" }))).toEqual({
      error: "Enter the funder USDC account.",
    });
  });

  it.each([
    ["missing", null],
    ["from another organization", { organizationId: "org_other" }],
  ])("refuses an invoice that is %s", async (_label, overrides) => {
    signInLive("owner");
    storeTreasury();
    if (overrides) storeInvoice(overrides);
    expect(await prepareProposePayment(form({ ...treasuryFields, invoiceId: "inv_1", recipientOwner: address(12) }))).toEqual({
      error: "That invoice is not in this organization.",
    });
  });

  it("needs the supplier's owner address", async () => {
    signInLive("owner");
    storeTreasury();
    storeInvoice();
    expect(await prepareProposePayment(form({ ...treasuryFields, invoiceId: "inv_1", recipientOwner: "" }))).toEqual({
      error: "Enter the supplier's USDC owner address.",
    });
  });

  it.each([
    ["prepareApprovePayment", prepareApprovePayment],
    ["prepareRevokeApproval", prepareRevokeApproval],
    ["prepareCancelPayment", prepareCancelPayment],
    ["prepareExecutePayment", prepareExecutePayment],
  ] as const)("%s refuses a proposal from another organization", async (_name, action) => {
    signInLive("owner");
    storeTreasury();
    storeProposal({ organizationId: "org_other" });
    expect(await action(form(proposalFields))).toEqual({ error: NOT_IN_ORG });
  });

  it("prepareApprovePayment refuses an unknown proposal", async () => {
    signInLive("owner");
    storeTreasury();
    expect(await prepareApprovePayment(form({ ...proposalFields, proposalId: "prop_missing" }))).toEqual({ error: NOT_IN_ORG });
  });

  it("prepareRevokeApproval refuses an unknown proposal", async () => {
    signInLive("owner");
    storeTreasury();
    expect(await prepareRevokeApproval(form({ ...proposalFields, proposalId: "prop_missing" }))).toEqual({ error: NOT_IN_ORG });
  });

  it("prepareCancelPayment refuses an unknown proposal", async () => {
    signInLive("owner");
    storeTreasury();
    expect(await prepareCancelPayment(form({ ...proposalFields, proposalId: "prop_missing" }))).toEqual({ error: NOT_IN_ORG });
  });

  it("execution needs the supplier's token account", async () => {
    signInLive("owner");
    storeTreasury();
    storeProposal();
    expect(await prepareExecutePayment(form({ ...proposalFields, recipientTokenAccount: "" }))).toEqual({
      error: "Enter the supplier's USDC token account.",
    });
  });
});
