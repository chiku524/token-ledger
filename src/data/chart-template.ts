import type { BooksAccount } from "./books";

/** Chart copied onto a newly created entity so journals have accounts to post to. No balances. */
export const ENTITY_CHART: readonly Omit<BooksAccount, "id" | "organizationId" | "entityId">[] = [
  { code: "1000", name: "Cash", type: "asset", normalBalance: "debit", measurementBasis: null, ifrsNote: "IAS 7" },
  { code: "1310", name: "Crypto", type: "asset", normalBalance: "debit", measurementBasis: "IAS 38", ifrsNote: "IAS 38" },
  { code: "1320", name: "Crypto for sale", type: "asset", normalBalance: "debit", measurementBasis: "IAS 2", ifrsNote: "IAS 2" },
  { code: "1330", name: "Stablecoins", type: "asset", normalBalance: "debit", measurementBasis: "IFRS 9", ifrsNote: "IFRS 9" },
  { code: "2100", name: "Bills to pay", type: "liability", normalBalance: "credit", measurementBasis: null, ifrsNote: "IAS 1" },
  { code: "3100", name: "Owners' capital", type: "equity", normalBalance: "credit", measurementBasis: null, ifrsNote: "IAS 1" },
  { code: "4100", name: "Staking rewards", type: "income", normalBalance: "credit", measurementBasis: null, ifrsNote: "IAS 1" },
  { code: "4200", name: "Revaluation gain", type: "income", normalBalance: "credit", measurementBasis: null, ifrsNote: "IAS 38" },
  { code: "5100", name: "Fees", type: "expense", normalBalance: "debit", measurementBasis: null, ifrsNote: "IAS 1" },
  { code: "5200", name: "Revaluation loss", type: "expense", normalBalance: "debit", measurementBasis: null, ifrsNote: "IAS 38" },
];
