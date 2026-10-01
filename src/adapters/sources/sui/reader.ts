/**
 * Read-only Sui reader. Composes the JSON-RPC client with the mappers: coin
 * balances, and movements from transaction-block balance changes. No signing
 * and no execute path.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { isValidSuiAddress, normalizeSuiAddress } from "./address";
import { mapSuiBalances, mapSuiTransactions } from "./map";
import type { SuiCoinBalance, SuiQueryResult } from "./sui-responses";
import type { SuiRpcClient } from "./rpc";

const MAX_TRANSACTION_BLOCKS = 50;

export class SuiReader {
  constructor(private readonly client: SuiRpcClient) {}

  async fetchBalances(address: string, now: Date = new Date()): Promise<NormalizedBalance[]> {
    const normalized = ensureAddress(address);
    const balances = await this.client.call<SuiCoinBalance[]>("suix_getAllBalances", [normalized]);
    return mapSuiBalances(balances, now);
  }

  async fetchTransactions(address: string, since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const normalized = ensureAddress(address);
    const result = await this.client.call<SuiQueryResult>("suix_queryTransactionBlocks", [
      { filter: { FromAddress: normalized }, options: { showBalanceChanges: true } },
      null,
      MAX_TRANSACTION_BLOCKS,
      true,
    ]);

    return mapSuiTransactions(result.data, normalized)
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
