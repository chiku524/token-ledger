/** Shapes of the EVM JSON-RPC responses the reader consumes. */

export interface TokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

export interface TokenBalancesResult {
  address: string;
  tokenBalances: TokenBalance[];
}

export interface AssetTransfer {
  blockNum: string;
  uniqueId: string;
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: "external" | "internal" | "erc20" | "erc721" | "erc1155" | "specialnft";
  rawContract: {
    value: string | null;
    address: string | null;
    decimal: string | null;
  };
  metadata: {
    blockTimestamp?: string;
  } | null;
}

export interface AssetTransfersResult {
  transfers: AssetTransfer[];
  pageKey?: string;
}
