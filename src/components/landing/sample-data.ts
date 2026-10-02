export const sources = [
  { name: "Wallets", amount: 684650, color: "bg-brand", accounts: 6 },
  { name: "Exchanges", amount: 450000, color: "bg-primary", accounts: 4 },
  { name: "Custodians", amount: 150000, color: "bg-chart-3", accounts: 2 },
];

export const totalAssets = sources.reduce((sum, source) => sum + source.amount, 0);
export const totalAccounts = sources.reduce((sum, source) => sum + source.accounts, 0);

export const money = (value: number, decimals = 0) =>
  new Intl.NumberFormat("en-MY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

export const activities = [
  { name: "Staking reward", amount: 650 },
  { name: "Token transfer", amount: -12400 },
  { name: "Exchange trade", amount: 8230.5 },
  { name: "Network fee", amount: -45.2 },
];

export const journal = [
  { account: "1310 Crypto", debit: 650, credit: 0 },
  { account: "4100 Staking rewards", debit: 0, credit: 650 },
];
