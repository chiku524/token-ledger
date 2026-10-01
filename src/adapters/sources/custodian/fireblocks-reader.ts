/**
 * Read-only Fireblocks reader. Composes the client with the mappers: balances
 * across vault accounts, and movements from completed transactions. Read-only
 * by construction: the client exposes only read methods.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import type { FireblocksClient } from "./fireblocks-client";
import { mapFireblocksBalances, mapFireblocksTransactions } from "./fireblocks-map";

export class FireblocksReader {
  constructor(private readonly client: FireblocksClient) {}

  async fetchBalances(now: Date = new Date()): Promise<NormalizedBalance[]> {
    const paged = await this.client.getVaultAccounts();
    return mapFireblocksBalances(paged.accounts, now);
  }

  async fetchTransactions(vaultAccountId: string, since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const after = Math.floor(Date.parse(`${since}T00:00:00.000Z`) / 1000);
    const before = until ? Math.floor(Date.parse(`${until}T23:59:59.999Z`) / 1000) : undefined;
    const transactions = await this.client.getTransactions({ after, before });
    return mapFireblocksTransactions(transactions, vaultAccountId)
      .filter((movement) => movement.occurredOn >= since && (!until || movement.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }
}
