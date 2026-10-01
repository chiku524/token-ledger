/** Shapes of the Sui GraphQL responses the reader consumes. */

export interface SuiGraphqlCoinType {
  repr: string;
}

export interface SuiGraphqlBalanceNode {
  coinType: SuiGraphqlCoinType;
  totalBalance: string;
}

export interface SuiGraphqlBalancesResult {
  address: {
    balances: {
      nodes: SuiGraphqlBalanceNode[];
    };
  } | null;
}

export interface SuiGraphqlBalanceChangeNode {
  owner: { address: string } | null;
  coinType: SuiGraphqlCoinType;
  amount: string;
}

export interface SuiGraphqlTransactionNode {
  digest: string;
  effects: {
    timestamp: string | null;
    balanceChanges: {
      nodes: SuiGraphqlBalanceChangeNode[];
    } | null;
  } | null;
}

export interface SuiGraphqlTransactionsResult {
  address: {
    transactions: {
      pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
      nodes: SuiGraphqlTransactionNode[];
    };
  } | null;
}
