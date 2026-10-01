/** Shapes of the Kraken REST responses the reader consumes. */

export interface KrakenAsset {
  aclass: string;
  altname: string;
  decimals: number;
  display_decimals: number;
  status: string;
}

export interface KrakenAssetsResult {
  [key: string]: KrakenAsset;
}

/** Balance is a map of asset key to decimal string. */
export type KrakenBalanceResult = Record<string, string>;

export interface KrakenLedgerEntry {
  refid: string;
  time: number;
  type: "deposit" | "withdrawal" | "transfer" | "trade" | "margin" | "rollover" | "credit" | "adjustment" | "settled";
  subtype?: string;
  aclass: string;
  asset: string;
  amount: string;
  fee: string;
  balance: string;
}

export interface KrakenLedgersResult {
  ledger: Record<string, KrakenLedgerEntry>;
  count: number;
}

export interface KrakenTradeEntry {
  ordertxid: string;
  postxid: string;
  pair: string;
  time: number;
  type: "buy" | "sell";
  ordertype: string;
  price: string;
  cost: string;
  fee: string;
  vol: string;
  margin?: string;
  misc: string;
  ledgers?: string[];
}

export interface KrakenTradesResult {
  trades: Record<string, KrakenTradeEntry>;
  count: number;
}

export interface KrakenApiResponse<T> {
  error: string[];
  result: T;
}
