/**
 * Shapes of the Solana JSON-RPC responses the reader consumes. Only the fields
 * we read are modelled; the RPC returns more.
 */

export interface RpcContext {
  slot: number;
  apiVersion?: string;
}

export interface BalanceResult {
  context: RpcContext;
  value: number;
}

export interface TokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

export interface ParsedTokenAccount {
  pubkey: string;
  account: {
    data: {
      program: string;
      parsed: {
        info: {
          isNative: boolean;
          mint: string;
          owner: string;
          tokenAmount: TokenAmount;
        };
      };
    };
  };
}

export interface TokenAccountsResult {
  context: RpcContext;
  value: ParsedTokenAccount[];
}

export interface SignatureInfo {
  blockTime: number | null;
  confirmationStatus: string;
  err: unknown | null;
  memo: string | null;
  signature: string;
  slot: number;
}

export type SignaturesResult = SignatureInfo[];

export interface ParsedInstruction {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
}

export interface TokenBalanceEntry {
  accountIndex: number;
  mint: string;
  uiTokenAmount: TokenAmount;
}

export interface ParsedTransaction {
  blockTime: number | null;
  slot: number;
  meta: {
    err: unknown | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: TokenBalanceEntry[];
    postTokenBalances: TokenBalanceEntry[];
  } | null;
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
      instructions: ParsedInstruction[];
    };
  };
}

export interface TransactionResult {
  result: ParsedTransaction | null;
}
