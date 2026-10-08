export const content = {
  eyebrow: "Digital asset accounting · Malaysia & Singapore",
  headline: ["All your digital assets,", "reconciled in one ledger"],
  description:
    "Bring wallets, exchanges and custodians into one view. Reconcile activity, review your books and prepare accounting reports.",
  demoLabel: "Go to app",
  signupLabel: "Create an account",
  workflowTitle: "A clearer path to your books.",
  steps: [
    {
      title: "Connect",
      description:
        "Bring wallets, exchanges and custodians together. Connections stay read-only — balances and movements — in one list of what you hold.",
    },
    {
      title: "Reconcile",
      description:
        "Compare activity from each source with your journal. Keep anything that needs a closer look in plain sight.",
    },
    {
      title: "Report",
      description:
        "Review balances across your companies. Prepare entries for Xero, QuickBooks or your accounting software.",
    },
  ],
  institutionsTitle: "Serving regulated institutions globally",
  institutions: [
    {
      name: "Banks",
      description: "Enterprise back-office with internal controls to ensure accurate reporting.",
    },
    {
      name: "Exchanges and brokers",
      description: "Get audit-ready and reconcile on-chain activities with internal systems.",
    },
    {
      name: "Stablecoin issuers",
      description: "Auditable stablecoin supply tracking for institutional-grade reporting.",
    },
    {
      name: "Token issuers",
      description: "Auditable token supply tracking for institutional grade reporting.",
    },
    {
      name: "Asset managers",
      description: "Auditable accounting and NAV reporting for on-chain activities.",
    },
    {
      name: "Fintech / Web3 startups",
      description:
        "Automatically reconcile on-chain transactions for fintech, RWA or funds, with Token Ledger as your outsourced CFO.",
    },
  ],
  convergence: {
    title: "How your sources become one ledger",
    captions: [
      "Wallets, exchanges and custodians, each with its own records.",
      "Token Ledger brings them into one set of books.",
      "Balanced entries, ready for Xero, QuickBooks or a CSV.",
    ],
    chips: [
      { label: "Self-custody wallet", kind: "wallet", x: 16, y: 8 },
      { label: "Exchange account", kind: "exchange", x: 50, y: 4 },
      { label: "Custodian vault", kind: "custodian", x: 84, y: 9 },
      { label: "Multisig wallet", kind: "wallet", x: 12, y: 64 },
      { label: "Trading desk", kind: "exchange", x: 40, y: 72 },
      { label: "Qualified custodian", kind: "custodian", x: 70, y: 65 },
      { label: "Hardware wallet", kind: "wallet", x: 88, y: 76 },
      { label: "Exchange sub-account", kind: "exchange", x: 8, y: 30 },
    ],
    exports: ["Xero", "QuickBooks", "CSV"],
  },
  ctaTitle: "See your assets come together.",
  ctaLabel: "Go to app",
};

export const navigation = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
];

export const exampleHref = "/sign-in?next=/dashboard";
export const signupHref = "/sign-up";
