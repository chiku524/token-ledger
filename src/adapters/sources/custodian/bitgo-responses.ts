/** Shapes of the BitGo REST responses the reader consumes. */

export interface BitGoWalletBalance {
  coin: string;
  balanceString: string;
  confirmedBalanceString: string;
  spendableBalanceString: string;
  walletId?: string;
  walletLabel?: string;
}

export interface BitGoBalancesResponse {
  balances: BitGoWalletBalance[];
}

export interface BitGoWallet {
  id: string;
  coin: string;
  label: string;
  balanceString?: string;
  confirmedBalanceString?: string;
  spendableBalanceString?: string;
  isCold?: boolean;
  deleted?: boolean;
}

export interface BitGoWalletsResponse {
  coin: string;
  wallets: Array<{ _wallet: BitGoWallet } & BitGoWallet>;
  count: number;
  nextBatchPrevId?: string;
}

export interface BitGoTransferEntry {
  address?: string;
  wallet?: string;
  walletLabel?: string;
  valueString?: string;
  isChange?: boolean;
  value?: number;
}

export interface BitGoTransfer {
  id: string;
  coin: string;
  txid?: string;
  date?: string;
  state?: string;
  type?: "send" | "receive";
  entries?: BitGoTransferEntry[];
  valueString?: string;
  value?: number;
  wallet?: string;
}

export interface BitGoTransfersResponse {
  transfers: BitGoTransfer[];
  count: number;
  nextBatchPrevId?: string;
}

export interface BitGoError {
  error: string;
  name: string;
  requestId?: string;
}
