/**
 * Read-only Kraken reader. Composes the client with the mappers: balances, and
 * movements from ledger entries and trades. Read-only by construction: the
 * client only exposes read methods. See docs/adr-exchange-connectors.md.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import type { KrakenClient } from "./kraken-client";
import { mapKrakenBalances, mapKrakenLedgers, mapKrakenTrades } from "./kraken-map";
import type { KrakenAssetsResult } from "./kraken-responses";

export class KrakenReader {
  private assets: KrakenAssetsResult | null = null;

  constructor(private readonly client: KrakenClient) {}

  private async loadAssets(): Promise<KrakenAssetsResult> {
    // Asset metadata is public and stable for a session; fetch once.
    this.assets ??= await this.client.getAssets();
    return this.assets;
  }

  async fetchBalances(now: Date = new Date()): Promise<NormalizedBalance[]> {
    const [assets, balance] = await Promise.all([this.loadAssets(), this.client.getBalance()]);
    return mapKrakenBalances(balance.result, assets, now);
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const assets = await this.loadAssets();
    const startUnix = toUnixStart(since);
    const endUnix = until ? toUnixEnd(until) : undefined;

    const [ledgers, trades] = await Promise.all([
      this.client.getLedgers({ start: startUnix, end: endUnix }),
      this.client.getTradesHistory({ start: startUnix, end: endUnix }),
    ]);

    const movements = [
      ...mapKrakenLedgers(ledgers.result.ledger, assets),
      ...mapKrakenTrades(trades.result.trades, assets),
    ];

    return movements
      .filter((movement) => movement.occurredOn >= since && (!until || movement.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0));
  }
}

function toUnixStart(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
}

function toUnixEnd(date: string): number {
  return Math.floor(new Date(`${date}T23:59:59.999Z`).getTime() / 1000);
}
