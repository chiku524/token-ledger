/** Shapes of the Fireblocks REST responses the reader consumes. */

export interface FireblocksVaultAccount {
  id: string;
  name: string;
  hiddenOnUI?: boolean;
  assets?: FireblocksVaultAsset[];
}

export interface FireblocksVaultAsset {
  id: string;
  total?: string;
  available?: string;
  balance?: string;
  pending?: string;
  frozen?: string;
  lockedAmount?: string;
  staked?: string;
  blockchain?: string;
}

export interface FireblocksPagedVaultAccounts {
  accounts: FireblocksVaultAccount[];
  paging?: { before?: string; after?: string };
}

export interface FireblocksTransaction {
  id: string;
  status: string;
  state?: string;
  createdAt?: number;
  lastUpdated?: number;
  assetId: string;
  amount: number;
  source?: { id?: string; type?: string; name?: string };
  destination?: { id?: string; type?: string; name?: string };
  txHash?: string;
}

export interface FireblocksError {
  message: string;
  code: number;
}
