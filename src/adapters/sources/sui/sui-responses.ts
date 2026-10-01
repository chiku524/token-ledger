/** Shapes of the Sui JSON-RPC responses the reader consumes. */

export interface SuiCoinBalance {
  coinType: string;
  coinObjectCount: number;
  totalBalance: string;
  lockedBalance?: Record<string, string>;
}

export interface SuiBalanceChange {
  owner: { AddressOwner?: string; ObjectOwner?: string; Shared?: unknown; Immutable?: unknown };
  coinType: string;
  amount: string;
}

export interface SuiTransactionBlock {
  digest: string;
  timestampMs: string | null;
  balanceChanges: SuiBalanceChange[] | null;
}

export interface SuiQueryResult {
  data: SuiTransactionBlock[];
  nextCursor: string | null;
  hasNextPage: boolean;
}
