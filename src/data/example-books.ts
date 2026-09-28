/**
 * EXAMPLE DATA. Harbourline Digital is fictional.
 * Figures are illustrative. They are not a price feed and not accounting advice.
 * Journal entries below are posted through the double-entry module, so the
 * sample cannot contain an unbalanced entry.
 */
import { ledgerQuantityMovements, postJournalEntry, reconcileMovements, toMinor } from "@/ledger";
import type { JournalEntryInput, JournalLineInput, LedgerAccount } from "@/ledger";

export const EXAMPLE_NOTICE =
  "Example data for the fictional Harbourline Digital group. Not live books, not a price feed, and not accounting advice.";

export const EXAMPLE_PERIOD = {
  start: "2026-04-01",
  end: "2026-06-30",
  label: "Q2 2026",
} as const;

const ORG_ID = "org_harbourline";
const MY = "ent_harbourline_my";
const SG = "ent_harbourline_sg";

const sen = (amount: string) => toMinor(amount, 2);
const eth = (amount: string) => toMinor(amount, 18);
const sol = (amount: string) => toMinor(amount, 9);
const usdc = (amount: string) => toMinor(amount, 6);

export const exampleOrganization = {
  id: ORG_ID,
  name: "Harbourline Digital",
  origin: "example" as const,
};

export const exampleEntities = [
  {
    id: MY,
    organizationId: ORG_ID,
    name: "Harbourline Digital Sdn. Bhd.",
    jurisdiction: "MY",
    functionalCurrency: "MYR",
    reportingFramework: "IFRS",
    parentEntityId: null,
  },
  {
    id: SG,
    organizationId: ORG_ID,
    name: "Harbourline Digital Pte. Ltd.",
    jurisdiction: "SG",
    functionalCurrency: "SGD",
    reportingFramework: "IFRS",
    parentEntityId: MY,
  },
] as const;

export const exampleAssets = [
  { id: "asset_eth", organizationId: ORG_ID, code: "ETH", name: "Ether", chain: "ethereum", decimals: 18, assetClass: "crypto" as const },
  { id: "asset_sol", organizationId: ORG_ID, code: "SOL", name: "Solana", chain: "solana", decimals: 9, assetClass: "crypto" as const },
  { id: "asset_usdc", organizationId: ORG_ID, code: "USDC", name: "USD Coin", chain: "ethereum", decimals: 6, assetClass: "stablecoin" as const },
  { id: "asset_pol", organizationId: ORG_ID, code: "POL", name: "Polygon", chain: "polygon", decimals: 18, assetClass: "crypto" as const },
];

export const exampleSources = [
  { id: "src_my_hot", organizationId: ORG_ID, entityId: MY, kind: "wallet" as const, role: "hot" as const, name: "Treasury hot wallet", chain: "ethereum", identifier: "0xHOT00000000000000000000000000000000E001" },
  { id: "src_my_cold", organizationId: ORG_ID, entityId: MY, kind: "wallet" as const, role: "cold" as const, name: "Treasury cold wallet", chain: "ethereum", identifier: "0xCOLD0000000000000000000000000000000E002" },
  { id: "src_my_stake", organizationId: ORG_ID, entityId: MY, kind: "wallet" as const, role: "staking" as const, name: "ETH staking position", chain: "ethereum", identifier: "0xSTAKE000000000000000000000000000000E003" },
  { id: "src_my_exchange", organizationId: ORG_ID, entityId: MY, kind: "exchange" as const, role: null, name: "Example Exchange — KL desk", chain: null, identifier: "acct-example-kl-001" },
  { id: "src_my_custody", organizationId: ORG_ID, entityId: MY, kind: "custodian" as const, role: null, name: "Northwharf Custody", chain: "ethereum", identifier: "nw-vault-example-14" },
  { id: "src_my_polygon", organizationId: ORG_ID, entityId: MY, kind: "wallet" as const, role: "hot" as const, name: "Polygon ops wallet", chain: "polygon", identifier: "0xPOL00000000000000000000000000000000E004" },
  { id: "src_sg_custody", organizationId: ORG_ID, entityId: SG, kind: "custodian" as const, role: null, name: "Straits Custody", chain: "solana", identifier: "sc-vault-example-sg-7" },
  { id: "src_sg_exchange", organizationId: ORG_ID, entityId: SG, kind: "exchange" as const, role: null, name: "Example Exchange — SG desk", chain: null, identifier: "acct-example-sg-014" },
];

function account(
  id: string,
  entityId: string,
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
    entityId,
    code,
    name,
    type,
    normalBalance,
    measurementBasis,
    ifrsNote,
  };
}

export const exampleAccounts = [
  account("acct_my_cash", MY, "1000", "Cash at bank", "asset", "debit", null, "IAS 7"),
  account("acct_my_intangible", MY, "1310", "Digital assets — intangible", "asset", "debit", "IAS 38", "IAS 38"),
  account("acct_my_inventory", MY, "1320", "Digital assets — inventory", "asset", "debit", "IAS 2", "IAS 2"),
  account("acct_my_stable", MY, "1330", "Stablecoins at custodian", "asset", "debit", "IFRS 9", "IFRS 9"),
  account("acct_my_payable", MY, "2100", "Accounts payable", "liability", "credit", null, "IAS 1"),
  account("acct_my_capital", MY, "3100", "Share capital", "equity", "credit", null, "IAS 1"),
  account("acct_my_yield", MY, "4100", "Staking and yield income", "income", "credit", null, "IAS 1"),
  account("acct_my_fees", MY, "5100", "Network and exchange fees", "expense", "debit", null, "IAS 1"),
  account("acct_sg_cash", SG, "1000", "Cash at bank", "asset", "debit", null, "IAS 7"),
  account("acct_sg_intangible", SG, "1310", "Digital assets — intangible", "asset", "debit", "IAS 38", "IAS 38"),
  account("acct_sg_capital", SG, "3100", "Share capital", "equity", "credit", null, "IAS 1"),
];

function myr(accountCode: string, side: JournalLineInput["side"], amount: string, extra: Partial<JournalLineInput> = {}): JournalLineInput {
  return { accountCode, side, amountMinor: sen(amount), currency: "MYR", ...extra };
}

function sgd(accountCode: string, side: JournalLineInput["side"], amount: string, extra: Partial<JournalLineInput> = {}): JournalLineInput {
  return { accountCode, side, amountMinor: sen(amount), currency: "SGD", ...extra };
}

const journalInputs: JournalEntryInput[] = [
  {
    id: "je_my_capital",
    entityId: MY,
    reference: "JE-2026-001",
    entryDate: "2026-04-02",
    memo: "Example — share capital subscribed in cash.",
    lines: [myr("1000", "debit", "500000.00"), myr("3100", "credit", "500000.00")],
  },
  {
    id: "je_my_buy_eth",
    entityId: MY,
    reference: "JE-2026-002",
    entryDate: "2026-04-08",
    memo: "Example — purchase 2.5 ETH on the example exchange.",
    lines: [
      myr("1310", "debit", "31000.00", {
        quantityMinor: eth("2.5"),
        assetCode: "ETH",
        quantityDirection: "in",
        sourceId: "src_my_exchange",
      }),
      myr("1000", "credit", "31000.00"),
    ],
  },
  {
    id: "je_my_to_cold",
    entityId: MY,
    reference: "JE-2026-003",
    entryDate: "2026-04-09",
    memo: "Example — move 2 ETH from the exchange to the cold wallet at carrying amount.",
    lines: [
      myr("1310", "debit", "24800.00", {
        quantityMinor: eth("2"),
        assetCode: "ETH",
        quantityDirection: "in",
        sourceId: "src_my_cold",
      }),
      myr("1310", "credit", "24800.00", {
        quantityMinor: eth("2"),
        assetCode: "ETH",
        quantityDirection: "out",
        sourceId: "src_my_exchange",
      }),
    ],
  },
  {
    id: "je_my_staking",
    entityId: MY,
    reference: "JE-2026-004",
    entryDate: "2026-05-01",
    memo: "Example — staking reward measured at an illustrative fair value.",
    lines: [
      myr("1310", "debit", "650.00", {
        quantityMinor: eth("0.05"),
        assetCode: "ETH",
        quantityDirection: "in",
        sourceId: "src_my_stake",
      }),
      myr("4100", "credit", "650.00"),
    ],
  },
  {
    id: "je_my_fee",
    entityId: MY,
    reference: "JE-2026-005",
    entryDate: "2026-05-12",
    memo: "Example — network fee settled in ETH from the cold wallet.",
    lines: [
      myr("5100", "debit", "26.00"),
      myr("1310", "credit", "26.00", {
        quantityMinor: eth("0.002"),
        assetCode: "ETH",
        quantityDirection: "out",
        sourceId: "src_my_cold",
      }),
    ],
  },
  {
    id: "je_my_usdc",
    entityId: MY,
    reference: "JE-2026-006",
    entryDate: "2026-06-03",
    memo: "Example — acquire 10,000 USDC held with Northwharf Custody.",
    lines: [
      myr("1330", "debit", "42000.00", {
        quantityMinor: usdc("10000"),
        assetCode: "USDC",
        quantityDirection: "in",
        sourceId: "src_my_custody",
      }),
      myr("1000", "credit", "42000.00"),
    ],
  },
  {
    id: "je_sg_capital",
    entityId: SG,
    reference: "JE-2026-007",
    entryDate: "2026-04-06",
    memo: "Example — share capital subscribed in cash.",
    lines: [sgd("1000", "debit", "80000.00"), sgd("3100", "credit", "80000.00")],
  },
  {
    id: "je_sg_sol",
    entityId: SG,
    reference: "JE-2026-008",
    entryDate: "2026-04-15",
    memo: "Example — purchase 100 SOL held with Straits Custody.",
    lines: [
      sgd("1310", "debit", "18000.00", {
        quantityMinor: sol("100"),
        assetCode: "SOL",
        quantityDirection: "in",
        sourceId: "src_sg_custody",
      }),
      sgd("1000", "credit", "18000.00"),
    ],
  },
];

export const exampleJournalEntries = journalInputs.map((input) => postJournalEntry(input));

export const exampleSourceTransactions = [
  txn("stx_my_buy", MY, "src_my_exchange", "ex-fill-example-1001", "2026-04-08", "ETH", "in", eth("2.5"), "Example exchange fill — buy 2.5 ETH."),
  txn("stx_my_withdraw", MY, "src_my_exchange", "ex-wd-example-1002", "2026-04-09", "ETH", "out", eth("2"), "Example exchange withdrawal of 2 ETH."),
  txn("stx_my_cold_in", MY, "src_my_cold", "chain-eth-example-cold-1", "2026-04-09", "ETH", "in", eth("2"), "Example cold-wallet deposit of 2 ETH."),
  txn("stx_my_reward", MY, "src_my_stake", "chain-eth-example-reward-1", "2026-05-01", "ETH", "in", eth("0.05"), "Example staking reward of 0.05 ETH."),
  txn("stx_my_fee", MY, "src_my_cold", "chain-eth-example-fee-1", "2026-05-12", "ETH", "out", eth("0.002"), "Example network fee of 0.002 ETH."),
  txn("stx_my_usdc", MY, "src_my_custody", "nw-example-usdc-44", "2026-06-03", "USDC", "in", usdc("10000"), "Example custodian receipt of 10,000 USDC."),
  txn("stx_my_unbooked", MY, "src_my_hot", "chain-eth-example-unbooked-1", "2026-06-18", "ETH", "in", eth("0.1"), "Example on-chain receipt with no journal entry yet."),
  txn("stx_sg_sol", SG, "src_sg_custody", "sc-example-sol-19", "2026-04-15", "SOL", "in", sol("100"), "Example custodian receipt of 100 SOL."),
];

function txn(
  id: string,
  entityId: string,
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
    entityId,
    sourceId,
    externalId,
    occurredOn,
    assetCode,
    direction,
    quantityMinor,
    description,
  };
}

const ledgerMovements = ledgerQuantityMovements(exampleJournalEntries);
const movementById = new Map(ledgerMovements.map((movement) => [movement.id, movement]));

export const exampleReconciliations = reconcileMovements(exampleSourceTransactions, ledgerMovements).map((match, index) => {
  const movement = match.ledgerMovementId ? movementById.get(match.ledgerMovementId) : undefined;
  return {
    id: `recon_${String(index + 1).padStart(2, "0")}`,
    organizationId: ORG_ID,
    entityId: match.entityId,
    periodStart: EXAMPLE_PERIOD.start,
    periodEnd: EXAMPLE_PERIOD.end,
    status: match.status,
    sourceId: match.sourceId,
    assetCode: match.assetCode,
    direction: match.direction,
    quantityMinor: match.quantityMinor,
    sourceTransactionId: match.sourceTransactionId,
    journalEntryId: movement?.journalEntryId ?? null,
    journalLineNumber: movement?.lineNumber ?? null,
    note: match.note,
  };
});

export const exampleBooks = {
  notice: EXAMPLE_NOTICE,
  period: EXAMPLE_PERIOD,
  organization: exampleOrganization,
  entities: exampleEntities,
  assets: exampleAssets,
  sources: exampleSources,
  accounts: exampleAccounts,
  journalEntries: exampleJournalEntries,
  sourceTransactions: exampleSourceTransactions,
  reconciliations: exampleReconciliations,
};

export function entityById(id: string) {
  return exampleEntities.find((entity) => entity.id === id);
}

export function sourceById(id: string) {
  return exampleSources.find((source) => source.id === id);
}

export function assetByCode(code: string) {
  return exampleAssets.find((asset) => asset.code === code);
}
