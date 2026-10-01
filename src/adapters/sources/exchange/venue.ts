/**
 * Shared shape for exchange venues. Each venue provides a read-only connector
 * that reads balances and movements for the whole account. A single
 * `ExchangeAdapter` wraps a connector behind the `ExchangeSourceAdapter` port,
 * so adding a venue is one module plus a registry entry.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { ListedAccount, NormalizedBalance, NormalizedSourceTransaction } from "../../types";

export interface VenueConnector {
  fetchBalances(now?: Date): Promise<NormalizedBalance[]>;
  fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]>;
  /** A cheap read used to validate a credential before it is stored. */
  verify(): Promise<void>;
}

export interface VenueDefinition {
  /** Ledger venue key, stored on the connection. */
  key: string;
  /** Human label. */
  label: string;
  /** One-line, used in the descriptor summary. */
  summary: string;
  /** Where the user creates a read-only key. */
  keyUrl: string;
  /** The read-only scopes to request. */
  scopes: string[];
  create(credential: ExchangeCredentialInput, options?: { baseUrl?: string; fetchImpl?: typeof fetch }): VenueConnector;
}

export function listAccountsFor(label: string, reference?: string): ListedAccount[] {
  return [{ externalAccountId: reference?.trim() || `${label.toLowerCase()}-account`, name: `${label} account`, chain: label.toLowerCase() }];
}
