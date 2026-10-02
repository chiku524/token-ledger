/**
 * A dated market price, independent of storage. `priceMinor` is the price of one
 * whole asset unit in minor units of `quoteCurrency`, whose scale is
 * `quoteScale` (2 for fiat). Keeping this in the ledger layer lets valuation and
 * staleness be tested without a database.
 */
export interface AssetPrice {
  id: string;
  organizationId: string;
  assetCode: string;
  quoteCurrency: string;
  priceMinor: bigint;
  quoteScale: number;
  /** ISO-8601 instant the price was observed. */
  asOf: string;
  origin: "example" | "live";
  source: string;
}
