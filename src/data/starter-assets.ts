/** Assets a new organization can record quantities against. No balances are created. */
export const STARTER_ASSETS = [
  { code: "ETH", name: "Ether", chain: "ethereum", decimals: 18, assetClass: "crypto" },
  { code: "SOL", name: "Solana", chain: "solana", decimals: 9, assetClass: "crypto" },
  { code: "USDC", name: "USD Coin", chain: "ethereum", decimals: 6, assetClass: "stablecoin" },
  { code: "POL", name: "Polygon", chain: "polygon", decimals: 18, assetClass: "crypto" },
  { code: "BTC", name: "Bitcoin", chain: "bitcoin", decimals: 8, assetClass: "crypto" },
  { code: "SUI", name: "Sui", chain: "sui", decimals: 9, assetClass: "crypto" },
] as const;
