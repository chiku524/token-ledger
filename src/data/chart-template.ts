import type { BooksAccount } from "./books";

/** Chart copied onto a newly created entity so journals have accounts to post to. No balances. */
export const ENTITY_CHART: readonly Omit<BooksAccount, "id" | "organizationId" | "entityId">[] = [
  { code: "1000", name: "Cash at bank", type: "asset", normalBalance: "debit", measurementBasis: null, ifrsNote: "IAS 7" },
  { code: "1310", name: "Digital assets — intangible", type: "asset", normalBalance: "debit", measurementBasis: "IAS 38", ifrsNote: "IAS 38" },
  { code: "1320", name: "Digital assets — inventory", type: "asset", normalBalance: "debit", measurementBasis: "IAS 2", ifrsNote: "IAS 2" },
  { code: "1330", name: "Stablecoins at custodian", type: "asset", normalBalance: "debit", measurementBasis: "IFRS 9", ifrsNote: "IFRS 9" },
  { code: "2100", name: "Accounts payable", type: "liability", normalBalance: "credit", measurementBasis: null, ifrsNote: "IAS 1" },
  { code: "3100", name: "Share capital", type: "equity", normalBalance: "credit", measurementBasis: null, ifrsNote: "IAS 1" },
  { code: "4100", name: "Staking and yield income", type: "income", normalBalance: "credit", measurementBasis: null, ifrsNote: "IAS 1" },
  { code: "5100", name: "Network and exchange fees", type: "expense", normalBalance: "debit", measurementBasis: null, ifrsNote: "IAS 1" },
];
