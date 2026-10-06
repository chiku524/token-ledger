import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CUSTODIANS } from "@/adapters/sources/custodian/registry";
import type { Role } from "@/auth/roles";
import type { Books } from "@/data/books";
import { exampleBooks } from "@/data/example-books";
import { loadBooks } from "@/data/load-books";
import { refreshAssetPrices, refreshFxRates } from "@/data/market-data";
import { runConnectionSync } from "@/data/run-sync";
import { approveDraft, createDraft, DraftError, submitDraft } from "@/db/drafts";
import { assertPeriodOpen, closePeriod, PeriodLockedError, reopenPeriod } from "@/db/period-locks";
import { matchReconciliation, ReconciliationError, unmatchReconciliation } from "@/db/reconciliation";
import {
  BooksWriteError,
  insertConnection,
  insertEntity,
  insertFxRate,
  insertJournal,
  insertReversal,
  insertSourceTransactions,
  revokeConnection,
} from "@/db/write";
import { LedgerError } from "@/ledger";
import {
  actorOf,
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
  revalidatePath,
  SG,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import {
  approveDraftAction,
  closePeriodAction,
  createConnectionAction,
  createEntityAction,
  createFxRateAction,
  importCsvAction,
  matchReconciliationAction,
  postJournalAction,
  postRevaluationAction,
  prepareJournalAction,
  refreshConnectionAction,
  refreshMarketDataAction,
  reopenPeriodAction,
  reverseJournalAction,
  revokeConnectionAction,
  submitDraftAction,
  unmatchReconciliationAction,
} from "./actions";

const venue = vi.hoisted(() => ({ verify: vi.fn(async () => undefined) }));

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/data/example-books")).exampleBooks),
}));
vi.mock("@/db/write", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/write")>()),
  insertEntity: vi.fn(async () => undefined),
  insertConnection: vi.fn(async () => undefined),
  insertJournal: vi.fn(async () => undefined),
  insertReversal: vi.fn(async () => undefined),
  insertFxRate: vi.fn(async () => undefined),
  insertSourceTransactions: vi.fn(async () => undefined),
  revokeConnection: vi.fn(async () => undefined),
}));
vi.mock("@/db/drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/drafts")>()),
  createDraft: vi.fn(async () => "draft_new"),
  submitDraft: vi.fn(async () => undefined),
  approveDraft: vi.fn(async () => undefined),
}));
vi.mock("@/db/reconciliation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/reconciliation")>()),
  matchReconciliation: vi.fn(async () => undefined),
  unmatchReconciliation: vi.fn(async () => undefined),
}));
vi.mock("@/db/period-locks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/period-locks")>()),
  assertPeriodOpen: vi.fn(async () => undefined),
  closePeriod: vi.fn(async () => undefined),
  reopenPeriod: vi.fn(async () => undefined),
}));
vi.mock("@/data/run-sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/run-sync")>()),
  runConnectionSync: vi.fn(async (_books: unknown, connectionId: string) => ({
    connectionId,
    status: "ok" as const,
    balances: 2,
    movements: 3,
    accounts: 1,
    message: "Read 2 balances and 3 movements.",
  })),
}));
vi.mock("@/data/market-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/market-data")>()),
  refreshAssetPrices: vi.fn(async (organizationId: string) => ({
    organizationId,
    assets: ["ETH"],
    stored: 1,
    source: "test",
    skipped: false,
    message: "Saved 1 price.",
  })),
  refreshFxRates: vi.fn(async (organizationId: string) => ({
    organizationId,
    pairs: ["MYR/SGD"],
    stored: 1,
    source: "test",
    skipped: false,
    message: "Saved 1 rate.",
  })),
}));
vi.mock("@/adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adapters")>()),
  createVenueConnector: vi.fn(() => venue),
}));

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";

const JOURNAL = {
  entityId: MY,
  reference: "JE-TEST-1",
  entryDate: "2026-06-20",
  memo: "Test entry",
  line0_account: "1000",
  line0_side: "debit",
  line0_amount: "100.00",
  line1_account: "3100",
  line1_side: "credit",
  line1_amount: "100.00",
};

const CSV = "external_id,occurred_on,asset_code,direction,quantity,description\nx-1,2026-06-20,ETH,in,0.5,Test receipt";

function revaluableBooks(): Books {
  return { ...exampleBooks, assetPrices: exampleBooks.assetPrices.map((price) => ({ ...price, quoteCurrency: "MYR" })) };
}

interface ActionSpec {
  name: string;
  action: (formData: FormData) => Promise<unknown>;
  path: string;
  allowed: Role;
  denied: Role;
  fields: Record<string, string>;
  write: () => Mock;
  saved: string;
  arrange?: () => void;
}

const specs: ActionSpec[] = [
  {
    name: "createEntityAction",
    action: createEntityAction,
    path: "/dashboard/entities",
    allowed: "admin",
    denied: "accountant",
    fields: { name: "Harbourline Labs", jurisdiction: "my", functionalCurrency: "MYR", reportingFramework: "IFRS", parentEntityId: MY },
    write: () => vi.mocked(insertEntity),
    saved: "Company added, with a standard set of accounts.",
  },
  {
    name: "createConnectionAction",
    action: createConnectionAction,
    path: "/dashboard/sources",
    allowed: "admin",
    denied: "accountant",
    fields: {
      next: "/dashboard/sources",
      entityId: MY,
      mode: "watch",
      name: "Ops wallet",
      chain: "ethereum",
      role: "hot",
      identifier: "0x0000000000000000000000000000000000000001",
    },
    write: () => vi.mocked(insertConnection),
    saved: "Read-only connection added. It is waiting for a check, and no key was stored.",
  },
  {
    name: "postRevaluationAction",
    action: postRevaluationAction,
    path: "/dashboard/reports",
    allowed: "accountant",
    denied: "approver",
    fields: { entityId: MY, asOf: "2026-06-30T00:00:00.000Z", reference: "REVAL-Q2" },
    write: () => vi.mocked(insertJournal),
    saved: "Revaluation posted. Net loss recorded; reverse it if the price was wrong.",
    arrange: () => vi.mocked(loadBooks).mockResolvedValue(revaluableBooks()),
  },
  {
    name: "refreshMarketDataAction",
    action: refreshMarketDataAction,
    path: "/dashboard/operations",
    allowed: "admin",
    denied: "accountant",
    fields: { next: "/dashboard/operations" },
    write: () => vi.mocked(refreshAssetPrices),
    saved: "Saved 1 price. Saved 1 rate.",
  },
  {
    name: "refreshConnectionAction",
    action: refreshConnectionAction,
    path: "/dashboard/sources",
    allowed: "admin",
    denied: "approver",
    fields: { next: "/dashboard/sources", connectionId: "conn_my_eth" },
    write: () => vi.mocked(runConnectionSync),
    saved: "Read 2 balances and 3 movements.",
  },
  {
    name: "revokeConnectionAction",
    action: revokeConnectionAction,
    path: "/dashboard/settings",
    allowed: "owner",
    denied: "viewer",
    fields: { connectionId: "conn_my_eth" },
    write: () => vi.mocked(revokeConnection),
    saved: "Connection disconnected. Past observations stay. Nothing further will be read.",
  },
  {
    name: "importCsvAction",
    action: importCsvAction,
    path: "/dashboard/sources",
    allowed: "accountant",
    denied: "approver",
    fields: { sourceId: "src_my_hot", csv: CSV },
    write: () => vi.mocked(insertSourceTransactions),
    saved: "Activity imported. Matching on the next load uses these rows.",
  },
  {
    name: "postJournalAction",
    action: postJournalAction,
    path: "/dashboard/ledger",
    allowed: "accountant",
    denied: "approver",
    fields: JOURNAL,
    write: () => vi.mocked(insertJournal),
    saved: "Entry posted. Posted entries are not edited. Post a correction if one is wrong.",
  },
  {
    name: "closePeriodAction",
    action: closePeriodAction,
    path: "/dashboard/reconciliation",
    allowed: "admin",
    denied: "accountant",
    fields: { entityId: MY, periodStart: "2026-04-01", periodEnd: "2026-06-30", note: "Q2 close" },
    write: () => vi.mocked(closePeriod),
    saved: "Period closed. Posting, reversing, and matching in these dates are refused until it is reopened.",
  },
  {
    name: "reopenPeriodAction",
    action: reopenPeriodAction,
    path: "/dashboard/reconciliation",
    allowed: "owner",
    denied: "approver",
    fields: { lockId: "lock_q2" },
    write: () => vi.mocked(reopenPeriod),
    saved: "Period reopened.",
  },
  {
    name: "matchReconciliationAction",
    action: matchReconciliationAction,
    path: "/dashboard/reconciliation",
    allowed: "accountant",
    denied: "viewer",
    fields: { sourceTransactionId: "stx_my_unbooked", journalLine: "je_my_capital:1", note: "Same receipt" },
    write: () => vi.mocked(matchReconciliation),
    saved: "Matched. The decision is saved and survives a reload.",
  },
  {
    name: "unmatchReconciliationAction",
    action: unmatchReconciliationAction,
    path: "/dashboard/reconciliation",
    allowed: "accountant",
    denied: "approver",
    fields: { sourceTransactionId: "stx_my_buy", note: "Wrong pair" },
    write: () => vi.mocked(unmatchReconciliation),
    saved: "Match rejected. The row is an exception again.",
  },
  {
    name: "prepareJournalAction",
    action: prepareJournalAction,
    path: "/dashboard/ledger",
    allowed: "approver",
    denied: "viewer",
    fields: JOURNAL,
    write: () => vi.mocked(createDraft),
    saved: "Draft saved. It is not in the books until an approver posts it.",
  },
  {
    name: "submitDraftAction",
    action: submitDraftAction,
    path: "/dashboard/approvals",
    allowed: "accountant",
    denied: "viewer",
    fields: { draftId: "draft_1" },
    write: () => vi.mocked(submitDraft),
    saved: "Draft submitted for approval.",
  },
  {
    name: "approveDraftAction",
    action: approveDraftAction,
    path: "/dashboard/approvals",
    allowed: "approver",
    denied: "accountant",
    fields: { draftId: "draft_1" },
    write: () => vi.mocked(approveDraft),
    saved: "Entry approved and posted.",
  },
  {
    name: "reverseJournalAction",
    action: reverseJournalAction,
    path: "/dashboard/ledger",
    allowed: "accountant",
    denied: "approver",
    fields: { entryId: "je_my_capital", reference: "JE-TEST-REV", entryDate: "2026-06-20", memo: "Wrong amount" },
    write: () => vi.mocked(insertReversal),
    saved: "Correction posted. The original entry is unchanged.",
  },
  {
    name: "createFxRateAction",
    action: createFxRateAction,
    path: "/dashboard/consolidation",
    allowed: "admin",
    denied: "accountant",
    fields: { baseCurrency: "myr", quoteCurrency: "sgd", rate: "0.3012", asOf: "2026-06-30", note: "Bank rate" },
    write: () => vi.mocked(insertFxRate),
    saved: "Rate saved. The other direction is calculated from this rate and is not stored separately.",
  },
];

beforeEach(() => {
  resetRequest();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(specs)("$name guards", (spec) => {
  it("saves for a permitted role and revalidates the dashboard", async () => {
    spec.arrange?.();
    signInLive(spec.allowed);
    await expectSaved(spec.action(form(spec.fields)), spec.path, spec.saved);
    expect(spec.write()).toHaveBeenCalledTimes(1);
  });

  it("refuses a role without the permission", async () => {
    spec.arrange?.();
    signInLive(spec.denied);
    await expectError(spec.action(form(spec.fields)), spec.path, NO_PERMISSION);
    expect(spec.write()).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("is read-only for a demo session with no database", async () => {
    spec.arrange?.();
    signInDemo(spec.allowed);
    await expectError(spec.action(form(spec.fields)), spec.path, READ_ONLY);
    expect(spec.write()).not.toHaveBeenCalled();
  });

  it("refuses a stale CSRF token", async () => {
    signInLive(spec.allowed);
    await expectError(spec.action(form(spec.fields, { csrf: "stale" })), spec.path, FORM_EXPIRED);
    expect(spec.write()).not.toHaveBeenCalled();
  });

  it("refuses a missing CSRF token", async () => {
    signInLive(spec.allowed);
    await expectError(spec.action(form(spec.fields, { csrf: null })), spec.path, FORM_EXPIRED);
    expect(spec.write()).not.toHaveBeenCalled();
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive(spec.allowed);
    await expectError(spec.action(form(spec.fields)), spec.path, CROSS_SITE);
    expect(spec.write()).not.toHaveBeenCalled();
  });

  it("refuses a request with no origin", async () => {
    resetRequest({ origin: null });
    signInLive(spec.allowed);
    await expectError(spec.action(form(spec.fields)), spec.path, CROSS_SITE);
    expect(spec.write()).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    const result = await redirectOf(spec.action(form(spec.fields)));
    expect(result.pathname).toBe("/sign-in");
    expect(spec.write()).not.toHaveBeenCalled();
  });
});

describe("save error branches", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("shows a BooksWriteError message", async () => {
    signInLive("accountant");
    vi.mocked(insertJournal).mockRejectedValue(new BooksWriteError("Reference JE-TEST-1 is already used for this company."));
    await expectError(postJournalAction(form(JOURNAL)), "/dashboard/ledger", "Reference JE-TEST-1 is already used for this company.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows a LedgerError message", async () => {
    signInLive("accountant");
    vi.mocked(insertReversal).mockRejectedValue(new LedgerError("DUPLICATE_ID", "JE-2026-001 already has a correction."));
    await expectError(
      reverseJournalAction(form({ entryId: "je_my_capital", reference: "R-1", entryDate: "2026-06-20", memo: "Again" })),
      "/dashboard/ledger",
      "JE-2026-001 already has a correction.",
    );
  });

  it("maps a unique violation, even when wrapped as a cause", async () => {
    signInLive("admin");
    vi.mocked(insertFxRate).mockRejectedValue(new Error("insert failed", { cause: { code: "23505" } }));
    await expectError(
      createFxRateAction(form(specs.find((spec) => spec.name === "createFxRateAction")!.fields)),
      "/dashboard/consolidation",
      "That reference or address is already in use.",
    );
  });

  it("maps a missing table to a migration hint", async () => {
    signInLive("admin");
    vi.mocked(insertEntity).mockRejectedValue({ code: "42P01" });
    await expectError(
      createEntityAction(form({ name: "Labs", jurisdiction: "MY", functionalCurrency: "MYR", reportingFramework: "IFRS", parentEntityId: "" })),
      "/dashboard/entities",
      "The database is missing a required table. Run migrations, then try again.",
    );
  });

  it("hides an unexpected error and logs it server-side", async () => {
    signInLive("accountant");
    vi.mocked(insertJournal).mockRejectedValue(new Error("ECONNRESET postgres://user:secret@db"));
    const result = await expectError(postJournalAction(form(JOURNAL)), "/dashboard/ledger", "Could not save the record.");
    expect(result.url).not.toContain("secret");
    expect(console.error).toHaveBeenCalledWith("books.save_failed", "ECONNRESET postgres://user:secret@db");
  });

  // Known bug: safeMessage only passes through AuthError, LedgerError and
  // BooksWriteError, so these domain errors reach the user as a generic failure.
  it.fails("shows the period-lock reason when a post lands in a closed period", async () => {
    signInLive("accountant");
    vi.mocked(insertJournal).mockRejectedValue(new PeriodLockedError("2026-06-20 is in a closed period."));
    await expectError(postJournalAction(form(JOURNAL)), "/dashboard/ledger", "2026-06-20 is in a closed period.");
  });

  it.fails("shows the segregation-of-duties reason when a preparer approves their own draft", async () => {
    signInLive("approver");
    const reason = "The preparer cannot approve their own entry without an owner's override note.";
    vi.mocked(approveDraft).mockRejectedValue(new DraftError(reason));
    await expectError(approveDraftAction(form({ draftId: "draft_1" })), "/dashboard/approvals", reason);
  });

  it.fails("shows the reconciliation reason when a match has no note", async () => {
    signInLive("accountant");
    vi.mocked(matchReconciliation).mockRejectedValue(new ReconciliationError("Add a note explaining the match."));
    await expectError(
      matchReconciliationAction(form({ sourceTransactionId: "stx_my_unbooked", journalLine: "je_my_capital:1", note: "" })),
      "/dashboard/reconciliation",
      "Add a note explaining the match.",
    );
  });
});

describe("createEntityAction", () => {
  it("uppercases the country code and records the actor", async () => {
    const user = signInLive("owner");
    await expectSaved(
      createEntityAction(form({ name: "Harbourline Labs", jurisdiction: "my", functionalCurrency: "MYR", reportingFramework: "IFRS", parentEntityId: MY })),
      "/dashboard/entities",
      "Company added, with a standard set of accounts.",
    );
    expect(insertEntity).toHaveBeenCalledWith(
      exampleBooks,
      { name: "Harbourline Labs", jurisdiction: "MY", functionalCurrency: "MYR", reportingFramework: "IFRS", parentEntityId: MY },
      actorOf(user),
    );
    expect(loadBooks).toHaveBeenCalledWith(ORG);
  });

  it("treats the empty parent option as a top-level company", async () => {
    signInLive("admin");
    await expectSaved(
      createEntityAction(form({ name: "Labs", jurisdiction: "SG", functionalCurrency: "SGD", reportingFramework: "SFRS", parentEntityId: "" })),
      "/dashboard/entities",
      "Company added, with a standard set of accounts.",
    );
    expect(vi.mocked(insertEntity).mock.calls[0]![1].parentEntityId).toBeNull();
  });

  it("returns the first validation issue", async () => {
    signInLive("admin");
    await expectError(
      createEntityAction(form({ name: "Labs", jurisdiction: "Malaysia", functionalCurrency: "MYR", reportingFramework: "IFRS", parentEntityId: "" })),
      "/dashboard/entities",
      "Country code must be two letters, such as MY or SG.",
    );
    expect(insertEntity).not.toHaveBeenCalled();
  });
});

describe("createConnectionAction", () => {
  const exchange = {
    entityId: MY,
    mode: "exchange_read",
    name: "Kraken desk",
    identifier: "kraken-main",
    exchangeVenue: "kraken",
    apiKey: "key",
    apiSecret: "secret",
  };

  it("falls back to Settings for an unknown return path", async () => {
    signInLive("admin");
    await expectSaved(
      createConnectionAction(form({ ...specs[1].fields, next: "https://evil.example/" })),
      "/dashboard/settings",
      "Read-only connection added. It is waiting for a check, and no key was stored.",
    );
  });

  it("keeps a setup step in the return path", async () => {
    signInLive("admin");
    const result = await expectSaved(
      createConnectionAction(form({ ...specs[1].fields, next: "/dashboard/setup?step=wallet" })),
      "/dashboard/setup",
      "Read-only connection added. It is waiting for a check, and no key was stored.",
    );
    expect(result.params.get("step")).toBe("wallet");
  });

  it("verifies an exchange credential before sealing it", async () => {
    const user = signInLive("admin");
    await expectSaved(
      createConnectionAction(form(exchange)),
      "/dashboard/settings",
      "Read-only connection added. The credential is stored sealed and cannot trade, withdraw, or sign.",
    );
    expect(venue.verify).toHaveBeenCalledTimes(1);
    expect(insertConnection).toHaveBeenCalledWith(exampleBooks, expect.anything(), actorOf(user), { apiKey: "key", apiSecret: "secret" });
  });

  it("rejects a credential the exchange refuses, and stores nothing", async () => {
    signInLive("admin");
    venue.verify.mockRejectedValue(new Error("Invalid key"));
    await expectError(createConnectionAction(form(exchange)), "/dashboard/settings", "Credential check failed: Invalid key");
    expect(insertConnection).not.toHaveBeenCalled();
  });

  it("requires a credential for a real exchange", async () => {
    signInLive("admin");
    await expectError(
      createConnectionAction(form({ ...exchange, apiKey: "", apiSecret: "" })),
      "/dashboard/settings",
      "A Kraken connection needs a read-only credential.",
    );
    expect(venue.verify).not.toHaveBeenCalled();
  });

  it("verifies a custodian credential", async () => {
    signInLive("admin");
    const verify = vi.spyOn(CUSTODIANS.fireblocks, "verify").mockResolvedValue(undefined);
    await expectSaved(
      createConnectionAction(
        form({ entityId: MY, mode: "custodian_read", name: "Vault", identifier: "vault-1", custodianVenue: "fireblocks", apiKey: "k", apiSecret: "s" }),
      ),
      "/dashboard/settings",
      "Read-only connection added. The credential is stored sealed and cannot trade, withdraw, or sign.",
    );
    expect(verify).toHaveBeenCalledWith({ apiKey: "k", apiSecret: "s" });
  });

  it("hides a custodian failure that is not a write error", async () => {
    signInLive("admin");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(CUSTODIANS.fireblocks, "verify").mockRejectedValue(new Error("403 from api.fireblocks.io"));
    await expectError(
      createConnectionAction(
        form({ entityId: MY, mode: "custodian_read", name: "Vault", identifier: "vault-1", custodianVenue: "fireblocks", apiKey: "k", apiSecret: "s" }),
      ),
      "/dashboard/settings",
      "Could not save the record.",
    );
    expect(insertConnection).not.toHaveBeenCalled();
  });

  it("returns the first validation issue", async () => {
    signInLive("admin");
    await expectError(
      createConnectionAction(form({ ...specs[1].fields, role: "" })),
      "/dashboard/sources",
      "A wallet needs a type: hot wallet, cold wallet, or staking.",
    );
  });
});

describe("postRevaluationAction", () => {
  it("posts one balanced entry from the saved prices", async () => {
    vi.mocked(loadBooks).mockResolvedValue(revaluableBooks());
    const user = signInLive("accountant");
    await expectSaved(
      postRevaluationAction(form({ entityId: MY, asOf: "2026-06-30T00:00:00.000Z", reference: "REVAL-Q2" })),
      "/dashboard/reports",
      "Revaluation posted. Net loss recorded; reverse it if the price was wrong.",
    );
    const [, entry, actor] = vi.mocked(insertJournal).mock.calls[0]!;
    expect(actor).toBe(actorOf(user));
    expect(entry).toMatchObject({ entityId: MY, reference: "REVAL-Q2", entryDate: "2026-06-30", memo: "Revaluation as of 2026-06-30" });
    const debit = entry.lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + line.amountMinor, 0n);
    const credit = entry.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + line.amountMinor, 0n);
    expect(debit).toBe(credit);
  });

  it("refuses when there is nothing to revalue", async () => {
    signInLive("accountant");
    await expectError(
      postRevaluationAction(form({ entityId: MY, asOf: "2026-06-30T00:00:00.000Z", reference: "REVAL-Q2" })),
      "/dashboard/reports",
      "Nothing to revalue: market value matches carrying value.",
    );
    expect(insertJournal).not.toHaveBeenCalled();
  });

  it("requires a reference", async () => {
    signInLive("accountant");
    await expectError(postRevaluationAction(form({ entityId: MY, asOf: "2026-06-30" })), "/dashboard/reports", "Give the revaluation a reference.");
  });

  it("refuses a company outside the organization", async () => {
    signInLive("accountant");
    await expectError(
      postRevaluationAction(form({ entityId: "ent_other", asOf: "2026-06-30", reference: "R" })),
      "/dashboard/reports",
      "Choose a company in this organization.",
    );
  });

  it("refuses a company outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    await expectError(postRevaluationAction(form({ entityId: MY, asOf: "2026-06-30", reference: "R" })), "/dashboard/reports", OUTSIDE_ACCESS);
  });
});

describe("refreshMarketDataAction", () => {
  it("fails when both feeds are skipped", async () => {
    signInLive("admin");
    vi.mocked(refreshAssetPrices).mockResolvedValue({ organizationId: ORG, assets: [], stored: 0, source: "none", skipped: true, message: "No price provider." });
    vi.mocked(refreshFxRates).mockResolvedValue({ organizationId: ORG, pairs: [], stored: 0, source: "none", skipped: true, message: "No FX provider." });
    await expectError(refreshMarketDataAction(form({})), "/dashboard/settings", "No price provider.");
  });

  it("succeeds when only one feed is skipped", async () => {
    signInLive("admin");
    vi.mocked(refreshFxRates).mockResolvedValue({ organizationId: ORG, pairs: [], stored: 0, source: "none", skipped: true, message: "No FX provider." });
    await expectSaved(refreshMarketDataAction(form({})), "/dashboard/settings", "Saved 1 price. No FX provider.");
    expect(refreshAssetPrices).toHaveBeenCalledWith(ORG);
  });
});

describe("refreshConnectionAction", () => {
  it("runs a manual sync as the signed-in user", async () => {
    const user = signInLive("admin");
    await expectSaved(refreshConnectionAction(form({ connectionId: "conn_my_eth" })), "/dashboard/settings", "Read 2 balances and 3 movements.");
    expect(runConnectionSync).toHaveBeenCalledWith(exampleBooks, "conn_my_eth", { actor: actorOf(user), trigger: "manual" });
  });

  it.each(["failed", "not_live"] as const)("reports a %s pull as an error", async (status) => {
    signInLive("admin");
    vi.mocked(runConnectionSync).mockResolvedValue({ connectionId: "conn_my_eth", status, balances: 0, movements: 0, accounts: 0, message: "The read failed." });
    await expectError(refreshConnectionAction(form({ connectionId: "conn_my_eth" })), "/dashboard/settings", "The read failed.");
  });

  it("refuses a connection from another organization", async () => {
    signInLive("admin");
    await expectError(refreshConnectionAction(form({ connectionId: "conn_other" })), "/dashboard/settings", "That connection is not in this organization.");
    expect(runConnectionSync).not.toHaveBeenCalled();
  });

  it("refuses a revoked connection", async () => {
    signInLive("admin");
    vi.mocked(loadBooks).mockResolvedValue({
      ...exampleBooks,
      connections: exampleBooks.connections.map((item) => (item.id === "conn_my_eth" ? { ...item, status: "revoked" as const } : item)),
    });
    await expectError(refreshConnectionAction(form({ connectionId: "conn_my_eth" })), "/dashboard/settings", "This connection is disconnected.");
  });

  it("refuses a connection with no linked account", async () => {
    signInLive("admin");
    vi.mocked(loadBooks).mockResolvedValue({ ...exampleBooks, sources: exampleBooks.sources.filter((source) => source.connectionId !== "conn_my_eth") });
    await expectError(refreshConnectionAction(form({ connectionId: "conn_my_eth" })), "/dashboard/settings", "This connection has no account to read.");
  });

  it("hides a thrown sync error", async () => {
    signInLive("admin");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(runConnectionSync).mockRejectedValue(new Error("socket hang up"));
    await expectError(refreshConnectionAction(form({ connectionId: "conn_my_eth" })), "/dashboard/settings", "Could not save the record.");
  });
});

describe("revokeConnectionAction", () => {
  it("revokes as the signed-in user", async () => {
    const user = signInLive("admin");
    await expectSaved(
      revokeConnectionAction(form({ connectionId: "conn_sg_custody", next: "/dashboard/sources" })),
      "/dashboard/sources",
      "Connection disconnected. Past observations stay. Nothing further will be read.",
    );
    expect(revokeConnection).toHaveBeenCalledWith(exampleBooks, "conn_sg_custody", actorOf(user));
  });

  it("refuses a connection from another organization", async () => {
    signInLive("admin");
    await expectError(revokeConnectionAction(form({ connectionId: "conn_other" })), "/dashboard/settings", "That connection is not in this organization.");
  });

  it("does not narrow an admin by entity scope", async () => {
    signInLive("admin", { entityScope: [SG] });
    await expectSaved(
      revokeConnectionAction(form({ connectionId: "conn_my_eth" })),
      "/dashboard/settings",
      "Connection disconnected. Past observations stay. Nothing further will be read.",
    );
  });
});

describe("importCsvAction", () => {
  it("imports parsed rows from the text field", async () => {
    const user = signInLive("accountant");
    await expectSaved(importCsvAction(form({ sourceId: "src_my_hot", csv: CSV })), "/dashboard/sources", "Activity imported. Matching on the next load uses these rows.");
    expect(insertSourceTransactions).toHaveBeenCalledWith(
      exampleBooks,
      "src_my_hot",
      [{ externalId: "x-1", occurredOn: "2026-06-20", assetCode: "ETH", direction: "in", quantityMinor: 500000000000000000n, description: "Test receipt" }],
      actorOf(user),
    );
  });

  it("prefers an uploaded file over the text field", async () => {
    signInLive("accountant");
    const file = new File([CSV.replace("x-1", "file-1")], "activity.csv", { type: "text/csv" });
    await expectSaved(
      importCsvAction(form({ sourceId: "src_my_hot", csv: "ignored", file })),
      "/dashboard/sources",
      "Activity imported. Matching on the next load uses these rows.",
    );
    expect(vi.mocked(insertSourceTransactions).mock.calls[0]![2][0]!.externalId).toBe("file-1");
  });

  it("returns the first CSV error", async () => {
    signInLive("accountant");
    await expectError(
      importCsvAction(form({ sourceId: "src_my_hot", csv: "a,b\n1,2" })),
      "/dashboard/sources",
      "Header must be external_id,occurred_on,asset_code,direction,quantity,description.",
    );
    expect(insertSourceTransactions).not.toHaveBeenCalled();
  });

  it("refuses an unknown source", async () => {
    signInLive("accountant");
    await expectError(importCsvAction(form({ sourceId: "src_other", csv: CSV })), "/dashboard/sources", "Choose a wallet, exchange, or custodian in this organization.");
  });

  it("refuses a source outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    await expectError(importCsvAction(form({ sourceId: "src_my_hot", csv: CSV })), "/dashboard/sources", OUTSIDE_ACCESS);
    expect(insertSourceTransactions).not.toHaveBeenCalled();
  });
});

describe("postJournalAction", () => {
  it("posts a balanced entry in the company's currency", async () => {
    const user = signInLive("accountant", { entityScope: [MY] });
    await expectSaved(postJournalAction(form(JOURNAL)), "/dashboard/ledger", specs.find((spec) => spec.name === "postJournalAction")!.saved);
    const [books, entry, actor] = vi.mocked(insertJournal).mock.calls[0]!;
    expect(books).toBe(exampleBooks);
    expect(actor).toBe(actorOf(user));
    expect(entry).toMatchObject({ entityId: MY, reference: "JE-TEST-1", entryDate: "2026-06-20", currency: "MYR" });
    expect(entry.lines.map((line) => [line.accountCode, line.side, line.amountMinor])).toEqual([
      ["1000", "debit", 10000n],
      ["3100", "credit", 10000n],
    ]);
  });

  it("refuses an unbalanced entry with the ledger's reason", async () => {
    signInLive("accountant");
    const result = await redirectOf(postJournalAction(form({ ...JOURNAL, line1_amount: "90.00" })));
    expect(result.pathname).toBe("/dashboard/ledger");
    expect(result.params.get("error")).toMatch(/balance/i);
    expect(insertJournal).not.toHaveBeenCalled();
  });

  it("refuses an account that is not on the company", async () => {
    signInLive("accountant");
    await expectError(
      postJournalAction(form({ ...JOURNAL, line1_account: "9999" })),
      "/dashboard/ledger",
      "Account 9999 is not on the accounts for Harbourline Digital Sdn. Bhd..",
    );
  });

  it("needs at least two lines", async () => {
    signInLive("accountant");
    await expectError(
      postJournalAction(form({ ...JOURNAL, line1_account: "", line1_amount: "" })),
      "/dashboard/ledger",
      "An entry needs at least two lines.",
    );
  });

  it("refuses a company outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    await expectError(postJournalAction(form(JOURNAL)), "/dashboard/ledger", OUTSIDE_ACCESS);
    expect(insertJournal).not.toHaveBeenCalled();
  });
});

describe("closePeriodAction and reopenPeriodAction", () => {
  it("closes a period for the company", async () => {
    const user = signInLive("owner");
    await expectSaved(
      closePeriodAction(form({ entityId: MY, periodStart: "2026-04-01", periodEnd: "2026-06-30", note: "Q2 close" })),
      "/dashboard/reconciliation",
      "Period closed. Posting, reversing, and matching in these dates are refused until it is reopened.",
    );
    expect(closePeriod).toHaveBeenCalledWith({
      organizationId: ORG,
      entityId: MY,
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      note: "Q2 close",
      actor: actorOf(user),
    });
  });

  it("refuses a company outside the organization", async () => {
    signInLive("admin");
    await expectError(
      closePeriodAction(form({ entityId: "ent_other", periodStart: "2026-04-01", periodEnd: "2026-06-30", note: "x" })),
      "/dashboard/reconciliation",
      "Choose a company in this organization.",
    );
    expect(closePeriod).not.toHaveBeenCalled();
  });

  it("reopens a lock in the user's organization", async () => {
    const user = signInLive("admin");
    await expectSaved(reopenPeriodAction(form({ lockId: "lock_q2" })), "/dashboard/reconciliation", "Period reopened.");
    expect(reopenPeriod).toHaveBeenCalledWith(ORG, "lock_q2", actorOf(user));
  });
});

describe("matchReconciliationAction and unmatchReconciliationAction", () => {
  it("matches a source row to a journal line", async () => {
    const user = signInLive("accountant");
    await expectSaved(
      matchReconciliationAction(form({ sourceTransactionId: "stx_my_unbooked", journalLine: "je_my_capital:2", note: "Same receipt" })),
      "/dashboard/reconciliation",
      "Matched. The decision is saved and survives a reload.",
    );
    expect(assertPeriodOpen).toHaveBeenCalledWith(ORG, MY, "2026-06-18");
    expect(matchReconciliation).toHaveBeenCalledWith({
      organizationId: ORG,
      entityId: MY,
      sourceTransactionId: "stx_my_unbooked",
      journalEntryId: "je_my_capital",
      journalLineNumber: 2,
      note: "Same receipt",
      actor: actorOf(user),
    });
  });

  it.each([
    ["an unknown entry", "je_other:1"],
    ["a line that is not a number", "je_my_capital:x"],
    ["no line", ""],
  ])("refuses %s", async (_label, journalLine) => {
    signInLive("accountant");
    await expectError(
      matchReconciliationAction(form({ sourceTransactionId: "stx_my_unbooked", journalLine, note: "n" })),
      "/dashboard/reconciliation",
      "Choose a journal line to match.",
    );
    expect(matchReconciliation).not.toHaveBeenCalled();
  });

  it("refuses activity from another organization", async () => {
    signInLive("accountant");
    await expectError(
      matchReconciliationAction(form({ sourceTransactionId: "stx_other", journalLine: "je_my_capital:1", note: "n" })),
      "/dashboard/reconciliation",
      "That activity is not in this organization.",
    );
  });

  it("refuses activity outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    await expectError(
      matchReconciliationAction(form({ sourceTransactionId: "stx_my_unbooked", journalLine: "je_my_capital:1", note: "n" })),
      "/dashboard/reconciliation",
      OUTSIDE_ACCESS,
    );
    await expectError(
      unmatchReconciliationAction(form({ sourceTransactionId: "stx_my_buy", note: "n" })),
      "/dashboard/reconciliation",
      OUTSIDE_ACCESS,
    );
    expect(assertPeriodOpen).not.toHaveBeenCalled();
  });

  it("stops before matching when the period is closed", async () => {
    signInLive("accountant");
    vi.mocked(assertPeriodOpen).mockRejectedValue(new BooksWriteError("That date is in a closed period."));
    await expectError(
      matchReconciliationAction(form({ sourceTransactionId: "stx_my_unbooked", journalLine: "je_my_capital:1", note: "n" })),
      "/dashboard/reconciliation",
      "That date is in a closed period.",
    );
    expect(matchReconciliation).not.toHaveBeenCalled();
  });

  it("unmatches a source row", async () => {
    const user = signInLive("accountant");
    await expectSaved(
      unmatchReconciliationAction(form({ sourceTransactionId: "stx_my_buy", note: "Wrong pair" })),
      "/dashboard/reconciliation",
      "Match rejected. The row is an exception again.",
    );
    expect(unmatchReconciliation).toHaveBeenCalledWith({
      organizationId: ORG,
      entityId: MY,
      sourceTransactionId: "stx_my_buy",
      note: "Wrong pair",
      actor: actorOf(user),
    });
  });

  it("refuses to unmatch activity from another organization", async () => {
    signInLive("accountant");
    await expectError(
      unmatchReconciliationAction(form({ sourceTransactionId: "stx_other", note: "n" })),
      "/dashboard/reconciliation",
      "That activity is not in this organization.",
    );
  });
});

describe("draft workflow", () => {
  it("prepares a draft with the preparer recorded", async () => {
    const user = signInLive("accountant");
    await expectSaved(prepareJournalAction(form(JOURNAL)), "/dashboard/ledger", "Draft saved. It is not in the books until an approver posts it.");
    expect(createDraft).toHaveBeenCalledWith(ORG, {
      entityId: MY,
      reference: "JE-TEST-1",
      entryDate: "2026-06-20",
      memo: "Test entry",
      currency: "MYR",
      lines: [
        expect.objectContaining({ accountCode: "1000", side: "debit", amountMinor: 10000n }),
        expect.objectContaining({ accountCode: "3100", side: "credit", amountMinor: 10000n }),
      ],
      preparedBy: actorOf(user),
      actor: actorOf(user),
    });
  });

  it("refuses to prepare for a company outside the user's scope", async () => {
    signInLive("approver", { entityScope: [SG] });
    await expectError(prepareJournalAction(form(JOURNAL)), "/dashboard/ledger", OUTSIDE_ACCESS);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("returns the first validation issue when preparing", async () => {
    signInLive("accountant");
    await expectError(prepareJournalAction(form({ ...JOURNAL, entryDate: "20/06/2026" })), "/dashboard/ledger", "Date must be YYYY-MM-DD.");
  });

  it("submits a draft", async () => {
    const user = signInLive("accountant");
    await expectSaved(submitDraftAction(form({ draftId: "draft_1" })), "/dashboard/approvals", "Draft submitted for approval.");
    expect(submitDraft).toHaveBeenCalledWith(ORG, "draft_1", actorOf(user));
  });

  it("approves without an override for a non-owner, even if one is sent", async () => {
    const user = signInLive("approver");
    await expectSaved(approveDraftAction(form({ draftId: "draft_1", overrideNote: "trust me" })), "/dashboard/approvals", "Entry approved and posted.");
    expect(approveDraft).toHaveBeenCalledWith({
      organizationId: ORG,
      draftId: "draft_1",
      approverActor: actorOf(user),
      approverRole: "approver",
      overrideNote: null,
    });
  });

  it("passes an owner's trimmed override note", async () => {
    signInLive("owner");
    await expectSaved(approveDraftAction(form({ draftId: "draft_1", overrideNote: "  Two-person rule waived  " })), "/dashboard/approvals", "Entry approved and posted.");
    expect(vi.mocked(approveDraft).mock.calls[0]![0]).toMatchObject({ approverRole: "owner", overrideNote: "Two-person rule waived" });
  });

  it("treats a blank owner override as none", async () => {
    signInLive("owner");
    await expectSaved(approveDraftAction(form({ draftId: "draft_1", overrideNote: "   " })), "/dashboard/approvals", "Entry approved and posted.");
    expect(vi.mocked(approveDraft).mock.calls[0]![0].overrideNote).toBeNull();
  });
});

describe("reverseJournalAction", () => {
  it("posts a correction for an entry in the books", async () => {
    const user = signInLive("accountant");
    await expectSaved(
      reverseJournalAction(form({ entryId: "je_my_capital", reference: "JE-TEST-REV", entryDate: "2026-06-20", memo: "Wrong amount" })),
      "/dashboard/ledger",
      "Correction posted. The original entry is unchanged.",
    );
    expect(insertReversal).toHaveBeenCalledWith(
      exampleBooks,
      "je_my_capital",
      { reference: "JE-TEST-REV", entryDate: "2026-06-20", memo: "Wrong amount" },
      actorOf(user),
    );
  });

  it("refuses an entry that is not in the books", async () => {
    signInLive("accountant");
    await expectError(
      reverseJournalAction(form({ entryId: "je_other", reference: "R", entryDate: "2026-06-20", memo: "m" })),
      "/dashboard/ledger",
      "That entry is not in these books.",
    );
  });

  it("refuses an entry outside the user's scope", async () => {
    signInLive("accountant", { entityScope: [SG] });
    await expectError(
      reverseJournalAction(form({ entryId: "je_my_capital", reference: "R", entryDate: "2026-06-20", memo: "m" })),
      "/dashboard/ledger",
      OUTSIDE_ACCESS,
    );
    expect(insertReversal).not.toHaveBeenCalled();
  });

  it("returns the first validation issue", async () => {
    signInLive("accountant");
    await expectError(reverseJournalAction(form({ entryId: "je_my_capital", reference: "", entryDate: "2026-06-20", memo: "m" })), "/dashboard/ledger", "Too small: expected string to have >=1 characters");
  });
});

describe("createFxRateAction", () => {
  it("stores the rate at scale 4 with uppercased codes", async () => {
    const user = signInLive("admin");
    await expectSaved(
      createFxRateAction(form({ baseCurrency: "myr", quoteCurrency: "sgd", rate: "0.3012", asOf: "2026-06-30", note: "Bank rate" })),
      "/dashboard/consolidation",
      "Rate saved. The other direction is calculated from this rate and is not stored separately.",
    );
    expect(insertFxRate).toHaveBeenCalledWith(
      exampleBooks,
      { baseCurrency: "MYR", quoteCurrency: "SGD", numerator: 3012n, scale: 4, asOf: "2026-06-30", note: "Bank rate" },
      actorOf(user),
    );
  });

  it.each([
    [{ quoteCurrency: "myr" }, "The two currencies must differ."],
    [{ rate: "0" }, "The rate must be positive."],
    [{ rate: "1.23456" }, "Rate can have at most 4 decimal places."],
  ])("refuses %o", async (override, message) => {
    signInLive("admin");
    await expectError(
      createFxRateAction(form({ baseCurrency: "myr", quoteCurrency: "sgd", rate: "0.3012", asOf: "2026-06-30", note: "Bank rate", ...override })),
      "/dashboard/consolidation",
      message,
    );
    expect(insertFxRate).not.toHaveBeenCalled();
  });
});
