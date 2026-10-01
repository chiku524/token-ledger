/**
 * Read-only Bitcoin reader. Composes the Esplora client with the UTXO
 * mappers: a balance from address stats, and movements from the transactions
 * that touch the address. No signing and no broadcast.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { isValidBitcoinAddress } from "./address";
import type { EsploraAddress, EsploraTx } from "./bitcoin-responses";
import { BTC_CODE, mapBitcoinBalance, mapBitcoinTransaction } from "./map";
import type { EsploraClient } from "./esplora";

export class BitcoinReader {
  constructor(private readonly client: EsploraClient) {}

  async fetchBalances(address: string, now: Date = new Date()): Promise<NormalizedBalance[]> {
    const normalized = ensureAddress(address);
    const data = await this.client.get<EsploraAddress>(`/address/${normalized}`);
    return [{ assetCode: BTC_CODE, quantityMinor: mapBitcoinBalance(data), asOf: now.toISOString() }];
  }

  async fetchTransactions(address: string, since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const normalized = ensureAddress(address);
    const transactions = await this.client.get<EsploraTx[]>(`/address/${normalized}/txs`);

    return transactions
      .map((tx) => mapBitcoinTransaction(tx, normalized))
      .filter((movement): movement is NormalizedSourceTransaction => movement !== null)
      .filter((movement) => movement.occurredOn >= since && (!until || movement.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0));
  }
}

function ensureAddress(address: string): string {
  if (!isValidBitcoinAddress(address)) {
    throw new Error(`"${address}" is not a valid Bitcoin address.`);
  }
  return address.trim();
}
