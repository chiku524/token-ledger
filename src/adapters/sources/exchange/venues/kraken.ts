/**
 * Kraken venue, wrapped for the shared exchange framework. Reuses the tested
 * client and reader.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import { KrakenClient } from "../kraken-client";
import { KrakenReader } from "../kraken-reader";
import type { VenueConnector, VenueDefinition } from "../venue";

class KrakenConnector implements VenueConnector {
  constructor(private readonly reader: KrakenReader) {}

  fetchBalances(now?: Date) {
    return this.reader.fetchBalances(now);
  }

  fetchTransactions(since: string, until?: string) {
    return this.reader.fetchTransactions(since, until);
  }

  async verify(): Promise<void> {
    await this.reader.fetchBalances();
  }
}

export const krakenVenue: VenueDefinition = {
  key: "kraken",
  label: "Kraken",
  summary: "Read-only balances, deposits, withdrawals, and trades from a Kraken account.",
  keyUrl: "https://www.kraken.com/u/security/api",
  scopes: ["Query Funds", "Query Ledger Entries", "Query Closed Orders & Trades"],
  create(credential: ExchangeCredentialInput, options = {}) {
    const client = new KrakenClient(credential, { baseUrl: options.baseUrl, fetchImpl: options.fetchImpl });
    return new KrakenConnector(new KrakenReader(client));
  },
};
