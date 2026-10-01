/**
 * Read-only BitGo reader. Balances come from one totals call; transfers are
 * read per coin/wallet. Read-only by construction: the client exposes only read
 * methods.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import type { BitGoClient } from "./bitgo-client";
import { mapBitGoBalances, mapBitGoTransfers } from "./bitgo-map";

export class BitGoReader {
  constructor(private readonly client: BitGoClient) {}

  async fetchBalances(now: Date = new Date()): Promise<NormalizedBalance[]> {
    const response = await this.client.getBalances();
    return mapBitGoBalances(response, now);
  }

  /**
   * Movements for one coin's wallets. BitGo transfers are per wallet, so read
   * the wallets for the coin, then their transfers, and merge.
   */
  async fetchTransactions(coin: string, since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const wallets = await this.client.getWallets(coin);
    const movements: NormalizedSourceTransaction[] = [];
    for (const wallet of wallets.wallets) {
      const id = wallet._wallet?.id ?? wallet.id;
      if (!id) continue;
      const transfers = await this.client.getTransfers(coin, id);
      movements.push(...mapBitGoTransfers(transfers.transfers, coin));
    }
    return movements
      .filter((movement) => movement.occurredOn >= since && (!until || movement.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }
}
