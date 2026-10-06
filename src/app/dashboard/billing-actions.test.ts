import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listActiveWalletBindings } from "@/db/wallet-bindings";
import {
  challengeTable,
  CROSS_SITE,
  form,
  FORM_EXPIRED,
  MY,
  ORG,
  OUTSIDE_ACCESS,
  redirectOf,
  resetRequest,
  SG,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import {
  prepareCreatePlan,
  prepareCreateVault,
  prepareDeposit,
  prepareRevoke,
  prepareWithdraw,
  type PreparedPlan,
} from "./billing-actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/client", async () => (await import("@/test/server-harness")).dbClientMock);
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/data/example-books")).exampleBooks),
}));
vi.mock("@/db/wallet-bindings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/wallet-bindings")>()),
  listActiveWalletBindings: vi.fn(async () => []),
}));

const READ_ONLY = "Connect a database to prepare transactions. This demo does not save them.";
const NOT_CONFIGURED = "The contract features are not configured on this deployment.";
const NO_MERCHANT = "This deployment has no merchant admin configured.";

const address = (seed: number) => base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(seed)));
const SERVICE_BALANCE = address(1);
const MERCHANT_ADMIN = address(4);
const CONTROLLER = address(5);
const TOKEN_ACCOUNT = address(6);
const VAULT = "vault_1";

function configureContracts(overrides: Record<string, string> = {}): void {
  const env: Record<string, string> = {
    SOLANA_CONTRACTS_CLUSTER: "devnet",
    SERVICE_BALANCE_PROGRAM_ID: SERVICE_BALANCE,
    TREASURY_PAYABLES_PROGRAM_ID: address(2),
    USDC_MINT: address(3),
    MERCHANT_ADMIN_ADDRESS: MERCHANT_ADMIN,
    SOLANA_RPC_URL: "",
    SPL_TOKEN_PROGRAM_ID: "",
    MERCHANT_DESTINATION_TOKEN_ACCOUNT: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

function storeVault(overrides: Record<string, unknown> = {}): void {
  challengeTable.rows = [
    { id: VAULT, organizationId: ORG, entityId: MY, merchantAddress: address(7), controllerAddress: CONTROLLER, ...overrides },
  ];
}

function bindController(overrides: Record<string, unknown> = {}): void {
  vi.mocked(listActiveWalletBindings).mockResolvedValue([
    { entityId: MY, walletAddress: CONTROLLER, cluster: "devnet", ...overrides } as Awaited<ReturnType<typeof listActiveWalletBindings>>[number],
  ]);
}

function planOf(result: PreparedPlan) {
  if ("error" in result) throw new Error(`Expected a plan, got: ${result.error}`);
  return result.plan;
}

const vaultFields = { entityId: MY, vaultId: VAULT, controller: CONTROLLER, tokenAccount: TOKEN_ACCOUNT, amount: "25" };

const actions = [
  ["prepareCreatePlan", prepareCreatePlan, { entityId: MY, price: "10", maxPeriods: "12" }],
  ["prepareCreateVault", prepareCreateVault, { entityId: MY, controller: CONTROLLER }],
  ["prepareDeposit", prepareDeposit, vaultFields],
  ["prepareWithdraw", prepareWithdraw, vaultFields],
  ["prepareRevoke", prepareRevoke, vaultFields],
] as const;

beforeEach(() => {
  resetRequest();
  configureContracts();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(actions)("%s guards", (_name, action, fields) => {
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

  it("reports a malformed deployment instead of throwing", async () => {
    vi.stubEnv("USDC_MINT", "not-an-address");
    signInLive("owner");
    const result = await action(form(fields));
    expect("error" in result && result.error).toMatch(/USDC_MINT/);
  });

  it("refuses a company that is not in the organization", async () => {
    signInLive("owner");
    expect(await action(form({ ...fields, entityId: "ent_elsewhere" }))).toEqual({ error: "Choose a company in this organization." });
  });
});

describe("prepareCreatePlan", () => {
  it("returns a plan signed and paid by the merchant admin", async () => {
    signInLive("owner");
    const plan = planOf(await prepareCreatePlan(form({ entityId: MY, price: "10", maxPeriods: "12" })));
    expect(plan.cluster).toBe("devnet");
    expect(plan.feePayer).toBe(MERCHANT_ADMIN);
    expect(plan.instructions.length).toBeGreaterThan(0);
    expect(plan.instructions.every((instruction) => instruction.programId === SERVICE_BALANCE)).toBe(true);
  });

  it("needs a merchant admin", async () => {
    vi.stubEnv("MERCHANT_ADMIN_ADDRESS", "");
    signInLive("owner");
    expect(await prepareCreatePlan(form({ entityId: MY, price: "10", maxPeriods: "12" }))).toEqual({ error: NO_MERCHANT });
  });

  it.each(["", "0", "-5", "abc"])("rejects the price %j", async (price) => {
    signInLive("owner");
    expect(await prepareCreatePlan(form({ entityId: MY, price, maxPeriods: "12" }))).toEqual({
      error: "Enter the price per 30-day period in USDC.",
    });
  });

  it.each(["0", "1001", "2.5", "x"])("rejects %j periods", async (maxPeriods) => {
    signInLive("owner");
    expect(await prepareCreatePlan(form({ entityId: MY, price: "10", maxPeriods }))).toEqual({
      error: "Choose a maximum number of periods.",
    });
  });
});

describe("prepareCreateVault", () => {
  it("returns a plan paid by a controller bound to the company", async () => {
    signInLive("owner");
    bindController();
    const plan = planOf(await prepareCreateVault(form({ entityId: MY, controller: CONTROLLER })));
    expect(plan.feePayer).toBe(CONTROLLER);
    expect(listActiveWalletBindings).toHaveBeenCalledWith(ORG);
  });

  it("needs a connected wallet", async () => {
    signInLive("owner");
    expect(await prepareCreateVault(form({ entityId: MY, controller: " " }))).toEqual({
      error: "Connect the wallet that will control this vault.",
    });
  });

  it.each([
    ["another company", { entityId: SG }],
    ["another wallet", { walletAddress: address(9) }],
    ["another cluster", { cluster: "mainnet-beta" }],
  ])("refuses a binding for %s", async (_label, overrides) => {
    signInLive("owner");
    bindController(overrides);
    expect(await prepareCreateVault(form({ entityId: MY, controller: CONTROLLER }))).toEqual({
      error: "Bind this wallet to the company first (Settings).",
    });
  });

  it("needs a merchant admin", async () => {
    vi.stubEnv("MERCHANT_ADMIN_ADDRESS", "");
    signInLive("owner");
    bindController();
    expect(await prepareCreateVault(form({ entityId: MY, controller: CONTROLLER }))).toEqual({ error: NO_MERCHANT });
  });
});

describe.each([
  ["prepareDeposit", prepareDeposit, "Enter a deposit amount in USDC."],
  ["prepareWithdraw", prepareWithdraw, "Enter a withdrawal amount in USDC."],
] as const)("%s", (_name, action, amountError) => {
  it("returns a plan paid by the vault controller", async () => {
    signInLive("owner");
    storeVault();
    expect(planOf(await action(form(vaultFields))).feePayer).toBe(CONTROLLER);
  });

  it("refuses a vault from another organization", async () => {
    signInLive("owner");
    storeVault({ organizationId: "org_other" });
    expect(await action(form(vaultFields))).toEqual({ error: "That billing vault is not in this organization." });
  });

  it("refuses an unknown vault", async () => {
    signInLive("owner");
    expect(await action(form(vaultFields))).toEqual({ error: "That billing vault is not in this organization." });
  });

  it("refuses a wallet that does not control the vault", async () => {
    signInLive("owner");
    storeVault();
    expect(await action(form({ ...vaultFields, controller: address(9) }))).toEqual({
      error: "Connect the wallet that controls this vault.",
    });
  });

  it("needs the USDC token account", async () => {
    signInLive("owner");
    storeVault();
    expect(await action(form({ ...vaultFields, tokenAccount: "" }))).toEqual({
      error: "Enter your USDC token account for this cluster.",
    });
  });

  it.each(["", "0", "-1", "1.1234567"])("rejects the amount %j", async (amount) => {
    signInLive("owner");
    storeVault();
    expect(await action(form({ ...vaultFields, amount }))).toEqual({ error: amountError });
  });
});

describe("plan actions", () => {
  it("prepareDeposit builds a deposit from the controller's token account", async () => {
    signInLive("owner");
    storeVault();
    const plan = planOf(await prepareDeposit(form(vaultFields)));
    expect(plan.action).toBe("billing.deposit");
    expect(plan.instructions.some((instruction) => instruction.accounts.some((account) => account.address === TOKEN_ACCOUNT))).toBe(true);
  });

  it("prepareWithdraw builds a withdrawal to the controller's token account", async () => {
    signInLive("owner");
    storeVault();
    const plan = planOf(await prepareWithdraw(form(vaultFields)));
    expect(plan.action).toBe("billing.withdraw");
    expect(plan.instructions.some((instruction) => instruction.accounts.some((account) => account.address === TOKEN_ACCOUNT))).toBe(true);
  });
});

describe("prepareRevoke", () => {
  it("returns a plan paid by the vault controller", async () => {
    signInLive("owner");
    storeVault();
    const plan = planOf(await prepareRevoke(form(vaultFields)));
    expect(plan.action).toBe("billing.revoke");
    expect(plan.feePayer).toBe(CONTROLLER);
  });

  it("refuses a wallet that does not control the vault", async () => {
    signInLive("owner");
    storeVault();
    expect(await prepareRevoke(form({ ...vaultFields, controller: address(9) }))).toEqual({
      error: "Connect the wallet that controls this vault.",
    });
  });
});
