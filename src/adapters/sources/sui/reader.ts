/**
 * Read-only Sui reader over the public GraphQL endpoint. Composes the client
 * with the mappers: coin balances, and movements from transaction balance
 * changes. No signing and no mutation path.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { isValidSuiAddress, normalizeSuiAddress } from "./address";
import { mapSuiBalances, mapSuiTransactions } from "./map";
import type { SuiGraphqlBalancesResult, SuiGraphqlTransactionsResult } from "./sui-responses";
import type { SuiGraphqlClient } from "./rpc";

const PAGE_SIZE = 50;
const MAX_PAGES = 4;

const BALANCES_QUERY = `
query SuiBalances($address: SuiAddress!) {
  address(address: $address) {
    balances {
      nodes { coinType { repr } totalBalance }
    }
  }
}`;

const TRANSACTIONS_QUERY = `
query SuiTransactions($address: SuiAddress!, $last: Int!, $before: String) {
  address(address: $address) {
    transactions(last: $last, before: $before) {
      pageInfo { hasPreviousPage startCursor }
      nodes {
        digest
        effects {
          timestamp
          balanceChanges { nodes { owner { address } coinType { repr } amount } }
        }
      }
    }
  }
}`;

export class SuiReader {
  constructor(private readonly client: SuiGraphqlClient) {}

  async fetchBalances(address: string, now: Date = new Date()): Promise<NormalizedBalance[]> {
    const normalized = ensureAddress(address);
    const result: SuiGraphqlBalancesResult = await this.client.query<SuiGraphqlBalancesResult>(BALANCES_QUERY, { address: normalized });
    return mapSuiBalances(result.address?.balances.nodes ?? [], now);
  }

  async fetchTransactions(address: string, since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const normalized = ensureAddress(address);
    const collected: NormalizedSourceTransaction[] = [];
    let before: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result: SuiGraphqlTransactionsResult = await this.client.query<SuiGraphqlTransactionsResult>(TRANSACTIONS_QUERY, {
        address: normalized,
        last: PAGE_SIZE,
        before,
      });
      const connection = result.address?.transactions;
      if (!connection) break;

      collected.push(...mapSuiTransactions(connection.nodes, normalized));

      // Stop early once the oldest row on the page is before the window.
      const oldest = connection.nodes[connection.nodes.length - 1]?.effects?.timestamp;
      if (!connection.pageInfo.hasPreviousPage || !oldest || oldest.slice(0, 10) < since) break;
      before = connection.pageInfo.startCursor;
      if (!before) break;
    }

    return collected
      .filter((movement) => movement.occurredOn >= since && (!until || movement.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0));
  }
}

function ensureAddress(address: string): string {
  if (!isValidSuiAddress(address)) {
    throw new Error(`"${address}" is not a valid Sui address.`);
  }
  return normalizeSuiAddress(address);
}
