/**
 * EXAMPLE DATA. Asset Manager A is fictional.
 * Figures are illustrative. They are not a price feed and not accounting advice.
 * Journal entries below are posted through the double-entry module, so the
 * sample cannot contain an unbalanced entry.
 *
 * The scenario: a Singapore asset manager holds three tokenised positions.
 *   - BlackRock BUIDL on Ethereum and Solana, in BlackRock's digital wallet,
 *     custodied by BNY Mellon.
 *   - USDC in a Circle wallet, custodied by BNY Mellon.
 *   - DBS tokenised gold on DBS's private EVM and on Hyperledger Fabric, in
 *     DBS's digital wallet, with DBS Digital Custody.
 *
 * One asset row is created per token; a token that lives on two chains gets one
 * source per chain, so the two on-chain balances roll up to a single price.
 */
import { postJournalEntry, toMinor } from "@/ledger";
import type { JournalEntryInput, JournalLineInput, LedgerAccount } from "@/ledger";
import type { AuditEvent, Books, BooksBalanceSnapshot, BooksConnection, StoredAssetPrice, StoredFxRate } from "./books";
import { buildReconciliations } from "./reconciliation";

export const EXAMPLE_NOTICE =
  "Example data for the fictional Asset Manager A. Not live books, not a price feed, and not accounting advice.";

export const EXAMPLE_PERIOD = {
  start: "2026-04-01",
  end: "2026-06-30",
  label: "Q2 2026",
} as const;

const ORG_ID = "org_asset_manager_a";
const ENT = "ent_asset_manager_a";

const usd = (amount: string) => toMinor(amount, 2);
const buidl = (amount: string) => toMinor(amount, 6);
const usdc = (amount: string) => toMinor(amount, 6);
const gold = (amount: string) => toMinor(amount, 18);

export const exampleOrganization = {
  id: ORG_ID,
  name: "Asset Manager A",
  origin: "example" as const,
};

export const exampleEntities = [
  {
    id: ENT,
    organizationId: ORG_ID,
    name: "Asset Manager A Pte. Ltd.",
    jurisdiction: "SG",
    functionalCurrency: "USD",
    reportingFramework: "IFRS",
    parentEntityId: null,
  },
] as const;

export const exampleAssets = [
  {
    id: "asset_ama_buidl",
    organizationId: ORG_ID,
    code: "BUIDL",
    name: "BlackRock USD Institutional Digital Liquidity Fund",
    chain: "ethereum",
    decimals: 6,
    assetClass: "stablecoin" as const,
  },
  {
    id: "asset_ama_usdc",
    organizationId: ORG_ID,
    code: "USDC",
    name: "USD Coin",
    chain: "ethereum",
    decimals: 6,
    assetClass: "stablecoin" as const,
  },
  {
    id: "asset_ama_gold",
    organizationId: ORG_ID,
    code: "XAU",
    name: "DBS tokenised gold",
    chain: "dbs-private-evm",
    decimals: 18,
    assetClass: "crypto" as const,
  },
];

const OBSERVED_AT = "2026-06-30T00:00:00.000Z";

function connection(
  id: string,
  mode: BooksConnection["mode"],
  venue: string,
  name: string,
  status: BooksConnection["status"],
  cursor: string | null,
): BooksConnection {
  return {
    id,
    organizationId: ORG_ID,
    entityId: ENT,
    mode,
    venue,
    name,
    status,
    scopes: "balances,movements",
    ownership: "watch_only",
    verifiedAddress: null,
    verifiedAt: null,
    cursor,
    lastSyncedAt: status === "pending" ? null : OBSERVED_AT,
    lastError: null,
    nextAttemptAt: null,
  };
}

export const exampleConnections: BooksConnection[] = [
  connection("conn_blackrock_eth", "watch", "ethereum", "BlackRock digital wallet — Ethereum", "healthy", "2026-06-18"),
  connection("conn_blackrock_sol", "watch", "solana", "BlackRock digital wallet — Solana", "healthy", "2026-06-18"),
  connection("conn_dbs_evm", "watch", "dbs-private-evm", "DBS digital wallet — private EVM", "healthy", "2026-06-20"),
  connection("conn_dbs_hl", "watch", "hyperledger-fabric", "DBS digital wallet — Hyperledger Fabric", "healthy", "2026-06-20"),
  connection("conn_bny", "custodian_read", "custodian", "BNY Mellon — Digital Custody", "healthy", "2026-06-03"),
  connection("conn_circle", "custodian_read", "custodian", "Circle Account", "healthy", "2026-06-03"),
  connection("conn_dbs_custody", "custodian_read", "custodian", "DBS Digital Custody", "healthy", "2026-06-20"),
];

export const exampleSources = [
  {
    id: "src_buidl_eth",
    organizationId: ORG_ID,
    entityId: ENT,
    connectionId: "conn_blackrock_eth",
    kind: "wallet" as const,
    role: "cold" as const,
    name: "BlackRock digital wallet (Ethereum)",
    chain: "ethereum",
    identifier: "0xB1AC00000000000000000000000000000000E001",
  },
  {
    id: "src_buidl_sol",
    organizationId: ORG_ID,
    entityId: ENT,
    connectionId: "conn_blackrock_sol",
    kind: "wallet" as const,
    role: "cold" as const,
    name: "BlackRock digital wallet (Solana)",
    chain: "solana",
    identifier: "Bu1dLs01anaWa11etExamp1e000000000000000001",
  },
  {
    id: "src_usdc_circle",
    organizationId: ORG_ID,
    entityId: ENT,
    connectionId: "conn_circle",
    kind: "wallet" as const,
    role: "cold" as const,
    name: "Circle wallet",
    chain: "ethereum",
    identifier: "0xC1RC00000000000000000000000000000000E002",
  },
  {
    id: "src_gold_evm",
    organizationId: ORG_ID,
    entityId: ENT,
    connectionId: "conn_dbs_evm",
    kind: "wallet" as const,
    role: "cold" as const,
    name: "DBS digital wallet (private EVM)",
    chain: "dbs-private-evm",
    identifier: "0xDB57EVM00000000000000000000000000000E003",
  },
  {
    id: "src_gold_hl",
    organizationId: ORG_ID,
    entityId: ENT,
    connectionId: "conn_dbs_hl",
    kind: "wallet" as const,
    role: "cold" as const,
    name: "DBS digital wallet (Hyperledger)",
    chain: "hyperledger-fabric",
    identifier: "hlf-dbs-wallet-0007",
  },
  {
    id: "src_bny_custody",
    organizationId: ORG_ID,
    entityId: ENT,
    connectionId: "conn_bny",
    kind: "custodian" as const,
    role: null,
    name: "BNY Mellon custody account",
    chain: null,
    identifier: "bny-custody-acct-001",
  },
  {
    id: "src_dbs_custody",
    organizationId: ORG_ID,
    entityId: ENT,
    connectionId: "conn_dbs_custody",
    kind: "custodian" as const,
    role: null,
    name: "DBS Digital Custody account",
    chain: null,
    identifier: "dbs-custody-acct-001",
  },
];

function account(
  id: string,
  code: string,
  name: string,
  type: LedgerAccount["type"],
  normalBalance: LedgerAccount["normalBalance"],
  measurementBasis: string | null,
  ifrsNote: string,
) {
  return {
    id,
    organizationId: ORG_ID,
    entityId: ENT,
    code,
    name,
    type,
    normalBalance,
    measurementBasis,
    ifrsNote,
  };
}

export const exampleAccounts = [
  account("acct_a_cash", "1000", "Cash", "asset", "debit", null, "IAS 7"),
  account("acct_a_digital", "1310", "Digital assets", "asset", "debit", "IAS 38", "IAS 38"),
  account("acct_a_tokens", "1330", "Stablecoins and tokenised funds", "asset", "debit", "IFRS 9", "IFRS 9"),
  account("acct_a_capital", "3100", "Owners' capital", "equity", "credit", null, "IAS 1"),
  account("acct_a_income", "4100", "Investment income", "income", "credit", null, "IAS 1"),
  account("acct_a_fees", "5100", "Fees", "expense", "debit", null, "IAS 1"),
];

function line(
  accountCode: string,
  side: JournalLineInput["side"],
  amount: string,
  extra: Partial<JournalLineInput> = {},
): JournalLineInput {
  return { accountCode, side, amountMinor: usd(amount), currency: "USD", ...extra };
}

const journalInputs: JournalEntryInput[] = [
  {
    id: "je_a_capital",
    entityId: ENT,
    reference: "JE-2026-001",
    entryDate: "2026-04-02",
    memo: "Example — share capital subscribed in cash.",
    lines: [line("1000", "debit", "5000000.00"), line("3100", "credit", "5000000.00")],
  },
  {
    id: "je_a_buidl",
    entityId: ENT,
    reference: "JE-2026-002",
    entryDate: "2026-04-08",
    memo: "Example — acquire 2,000,000 BUIDL in BlackRock's digital wallet (Ethereum).",
    lines: [
      line("1330", "debit", "2000000.00", {
        quantityMinor: buidl("2000000"),
        assetCode: "BUIDL",
        quantityDirection: "in",
        sourceId: "src_buidl_eth",
      }),
      line("1000", "credit", "2000000.00"),
    ],
  },
  {
    id: "je_a_usdc",
    entityId: ENT,
    reference: "JE-2026-003",
    entryDate: "2026-05-05",
    memo: "Example — acquire 1,500,000 USDC in the Circle wallet.",
    lines: [
      line("1330", "debit", "1500000.00", {
        quantityMinor: usdc("1500000"),
        assetCode: "USDC",
        quantityDirection: "in",
        sourceId: "src_usdc_circle",
      }),
      line("1000", "credit", "1500000.00"),
    ],
  },
  {
    id: "je_a_gold",
    entityId: ENT,
    reference: "JE-2026-004",
    entryDate: "2026-05-20",
    memo: "Example — acquire 312.5 units of DBS tokenised gold on the private EVM.",
    lines: [
      line("1310", "debit", "750000.00", {
        quantityMinor: gold("312.5"),
        assetCode: "XAU",
        quantityDirection: "in",
        sourceId: "src_gold_evm",
      }),
      line("1000", "credit", "750000.00"),
    ],
  },
  {
    id: "je_a_move_buidl",
    entityId: ENT,
    reference: "JE-2026-005",
    entryDate: "2026-06-01",
    memo: "Example — move 500,000 BUIDL from Ethereum to Solana at carrying amount.",
    lines: [
      line("1330", "debit", "500000.00", {
        quantityMinor: buidl("500000"),
        assetCode: "BUIDL",
        quantityDirection: "in",
        sourceId: "src_buidl_sol",
      }),
      line("1330", "credit", "500000.00", {
        quantityMinor: buidl("500000"),
        assetCode: "BUIDL",
        quantityDirection: "out",
        sourceId: "src_buidl_eth",
      }),
    ],
  },
  {
    id: "je_a_income",
    entityId: ENT,
    reference: "JE-2026-006",
    entryDate: "2026-06-15",
    memo: "Example — BUIDL distribution reinvested in the Ethereum wallet.",
    lines: [
      line("1330", "debit", "12500.00", {
        quantityMinor: buidl("12500"),
        assetCode: "BUIDL",
        quantityDirection: "in",
        sourceId: "src_buidl_eth",
      }),
      line("4100", "credit", "12500.00"),
    ],
  },
  {
    id: "je_a_fee",
    entityId: ENT,
    reference: "JE-2026-007",
    entryDate: "2026-06-20",
    memo: "Example — custody fee settled in USDC from the Circle wallet.",
    lines: [
      line("5100", "debit", "450.00"),
      line("1330", "credit", "450.00", {
        quantityMinor: usdc("450"),
        assetCode: "USDC",
        quantityDirection: "out",
        sourceId: "src_usdc_circle",
      }),
    ],
  },
];

export const exampleJournalEntries = journalInputs.map((input) => ({
  ...postJournalEntry(input),
  postedBy: "example books",
  postedAt: `${input.entryDate}T00:00:00.000Z`,
  reversesEntryId: null,
}));

export const exampleSourceTransactions = [
  txn("stx_a_buidl_eth", "src_buidl_eth", "blk-eth-buidl-1001", "2026-04-08", "BUIDL", "in", buidl("2000000"), "Example — BlackRock wallet receipt of 2,000,000 BUIDL on Ethereum."),
  txn("stx_a_usdc", "src_usdc_circle", "circle-usdc-2002", "2026-05-05", "USDC", "in", usdc("1500000"), "Example — Circle wallet receipt of 1,500,000 USDC."),
  txn("stx_a_gold_evm", "src_gold_evm", "dbs-evm-gold-3003", "2026-05-20", "XAU", "in", gold("312.5"), "Example — DBS private-EVM receipt of 312.5 gold units."),
  txn("stx_a_move_out", "src_buidl_eth", "blk-eth-buidl-4004", "2026-06-01", "BUIDL", "out", buidl("500000"), "Example — BUIDL sent from the Ethereum wallet to Solana."),
  txn("stx_a_move_in", "src_buidl_sol", "blk-sol-buidl-4005", "2026-06-01", "BUIDL", "in", buidl("500000"), "Example — BUIDL received on Solana."),
  txn("stx_a_income", "src_buidl_eth", "blk-eth-buidl-5006", "2026-06-15", "BUIDL", "in", buidl("12500"), "Example — BUIDL distribution of 12,500."),
  txn("stx_a_fee", "src_usdc_circle", "circle-usdc-6007", "2026-06-20", "USDC", "out", usdc("450"), "Example — custody fee of 450 USDC."),
  txn("stx_a_unbooked", "src_gold_hl", "dbs-hlf-gold-7008", "2026-06-25", "XAU", "in", gold("5"), "Example — Hyperledger receipt of 5 gold units with no journal entry yet."),
];

function txn(
  id: string,
  sourceId: string,
  externalId: string,
  occurredOn: string,
  assetCode: string,
  direction: "in" | "out",
  quantityMinor: bigint,
  description: string,
) {
  return {
    id,
    organizationId: ORG_ID,
    entityId: ENT,
    sourceId,
    externalId,
    occurredOn,
    assetCode,
    direction,
    quantityMinor,
    description,
  };
}

function snap(
  id: string,
  sourceId: string,
  assetCode: string,
  quantityMinor: bigint,
): BooksBalanceSnapshot {
  return {
    id,
    organizationId: ORG_ID,
    entityId: ENT,
    sourceId,
    assetCode,
    quantityMinor,
    asOf: OBSERVED_AT,
  };
}

/** Example observations. The Hyperledger 5 gold units are on chain and not yet in the journal. */
export const exampleBalanceSnapshots: BooksBalanceSnapshot[] = [
  snap("snap_buidl_eth", "src_buidl_eth", "BUIDL", buidl("1512500")),
  snap("snap_buidl_sol", "src_buidl_sol", "BUIDL", buidl("500000")),
  snap("snap_usdc_circle", "src_usdc_circle", "USDC", usdc("1499550")),
  snap("snap_gold_evm", "src_gold_evm", "XAU", gold("312.5")),
  snap("snap_gold_hl", "src_gold_hl", "XAU", gold("5")),
];

export const exampleReconciliations = buildReconciliations(
  ORG_ID,
  exampleSourceTransactions,
  exampleJournalEntries,
  EXAMPLE_PERIOD.start,
).map((row, index) => ({ ...row, id: `recon_ama_${String(index + 1).padStart(2, "0")}` }));

export const exampleFxRates: StoredFxRate[] = [
  {
    id: "fx_ama_usd_sgd",
    organizationId: ORG_ID,
    baseCurrency: "USD",
    quoteCurrency: "SGD",
    numerator: 13500n,
    scale: 4,
    asOf: "2026-04-01",
    origin: "example",
    note: "Illustrative example rate (1 USD = 1.35 SGD) so Holdings can convert USD prices when a native SGD quote is missing. Not a market price.",
  },
  {
    id: "fx_ama_usd_myr",
    organizationId: ORG_ID,
    baseCurrency: "USD",
    quoteCurrency: "MYR",
    numerator: 47000n,
    scale: 4,
    asOf: "2026-04-01",
    origin: "example",
    note: "Illustrative example rate (1 USD = 4.70 MYR) so Holdings can convert USD prices when a native MYR quote is missing. Not a market price.",
  },
];

/**
 * Illustrative example prices as of the example period. USD figures are the
 * seed; SGD and MYR use fixed demo FX (1 USD = 1.35 SGD, 1 USD = 4.70 MYR) so
 * Holdings can toggle display currency without a live price fetch. Not market
 * prices — origin "example".
 */
const EXAMPLE_PRICES_USD: Array<{ assetCode: string; priceMinor: bigint }> = [
  { assetCode: "BUIDL", priceMinor: 100n },
  { assetCode: "USDC", priceMinor: 100n },
  { assetCode: "XAU", priceMinor: 240000n },
];

/** Demo-only FX multipliers from USD minor units (scale 2) into SGD / MYR. */
const EXAMPLE_USD_TO_SGD_NUM = 135n;
const EXAMPLE_USD_TO_SGD_DEN = 100n;
const EXAMPLE_USD_TO_MYR_NUM = 470n;
const EXAMPLE_USD_TO_MYR_DEN = 100n;

function examplePriceRows(
  quoteCurrency: "USD" | "SGD" | "MYR",
  convert: (usdMinor: bigint) => bigint,
): StoredAssetPrice[] {
  return EXAMPLE_PRICES_USD.map((price) => ({
    id: `price_ama_${price.assetCode.toLowerCase()}_${quoteCurrency.toLowerCase()}`,
    organizationId: ORG_ID,
    assetCode: price.assetCode,
    quoteCurrency,
    priceMinor: convert(price.priceMinor),
    quoteScale: 2,
    asOf: `${EXAMPLE_PERIOD.end}T00:00:00.000Z`,
    origin: "example" as const,
    source: "example",
  }));
}

export const exampleAssetPrices: StoredAssetPrice[] = [
  ...examplePriceRows("USD", (value) => value),
  ...examplePriceRows("SGD", (value) => (value * EXAMPLE_USD_TO_SGD_NUM) / EXAMPLE_USD_TO_SGD_DEN),
  ...examplePriceRows("MYR", (value) => (value * EXAMPLE_USD_TO_MYR_NUM) / EXAMPLE_USD_TO_MYR_DEN),
];

export const exampleAuditEvents: AuditEvent[] = exampleJournalEntries.map((entry) => ({
  id: `audit_${entry.id}`,
  organizationId: ORG_ID,
  occurredAt: entry.postedAt,
  actor: entry.postedBy,
  action: "journal.posted",
  subjectType: "journal_entry",
  subjectId: entry.id,
  detail: `${entry.reference} · ${entry.memo}`,
}));

export const exampleBooks = {
  notice: EXAMPLE_NOTICE,
  period: EXAMPLE_PERIOD,
  organization: exampleOrganization,
  entities: exampleEntities,
  assets: exampleAssets,
  connections: exampleConnections,
  sources: exampleSources,
  balanceSnapshots: exampleBalanceSnapshots,
  accounts: exampleAccounts,
  journalEntries: exampleJournalEntries,
  sourceTransactions: exampleSourceTransactions,
  reconciliations: exampleReconciliations,
  fxRates: exampleFxRates,
  assetPrices: exampleAssetPrices,
  reconciliationOverrides: [],
  auditEvents: exampleAuditEvents,
} satisfies Books;

export function entityById(id: string) {
  return exampleEntities.find((entity) => entity.id === id);
}

export function sourceById(id: string) {
  return exampleSources.find((source) => source.id === id);
}

export function assetByCode(code: string) {
  return exampleAssets.find((asset) => asset.code === code);
}
