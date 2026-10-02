/**
 * Read-only Solana reader. Composes the JSON-RPC client with the response
 * mappers: observed balances, and source movements from confirmed
 * transactions. No signing and no write method is ever called.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { isValidSolanaAddress } from "./address";
import { mapBalancesToObservations } from "./map-balances";
import { mapTransactionToMovements } from "./map-transactions";
import type { SolanaMint } from "./mints";
import type {
  BalanceResult,
  ParsedTransaction,
  SignaturesResult,
  TokenAccountsResult,
} from "./solana-responses";
import type { SolanaRpcClient } from "./rpc";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const DEFAULT_SIGNATURE_LIMIT = 100;

export class SolanaReader {
  constructor(
    private readonly client: SolanaRpcClient,
    private readonly registry?: ReadonlyMap<string, SolanaMint>,
  ) {}

  async fetchBalances(address: string, now: Date = new Date()): Promise<NormalizedBalance[]> {
    assertAddress(address);
    const [native, tokens] = await Promise.all([
      this.client.call<BalanceResult>("getBalance", [address, { commitment: "finalized" }]),
      this.client.call<TokenAccountsResult>("getTokenAccountsByOwner", [
        address,
        { programId: TOKEN_PROGRAM_ID },
        { encoding: "jsonParsed", commitment: "finalized" },
      ]),
    ]);
    return mapBalancesToObservations(native, tokens, now, this.registry);
  }

  async fetchTransactions(
    address: string,
    since: string,
    until?: string,
    options: { maxSignatures?: number } = {},
  ): Promise<NormalizedSourceTransaction[]> {
    assertAddress(address);
    const limit = options.maxSignatures ?? DEFAULT_SIGNATURE_LIMIT;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("maxSignatures must be a positive integer.");
    }
    const signatures = await this.client.call<SignaturesResult>("getSignaturesForAddress", [
      address,
      { limit, commitment: "finalized" },
    ]);

    const inRange = signatures.filter((entry) => {
      if (entry.err !== null) return false;
      if (entry.blockTime === null) return false;
      const day = new Date(entry.blockTime * 1000).toISOString().slice(0, 10);
      if (day < since) return false;
      if (until && day > until) return false;
      return true;
    });

    const movements: NormalizedSourceTransaction[] = [];
    for (const entry of inRange) {
      // Version 1 covers both legacy (0) and versioned (1) transactions; the
      // RPC rejects the request outright if the client asks for a version lower
      // than a transaction in the result.
      let response: ParsedTransaction | null;
      try {
        response = await this.client.call<ParsedTransaction | null>("getTransaction", [
          entry.signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "finalized" },
        ]);
      } catch {
        // One unreadable transaction must not sink the whole read; skip it and
        // keep the rest of the history.
        continue;
      }
      if (!response) continue;
      movements.push(...mapTransactionToMovements(entry.signature, response, address, this.registry));
    }

    return movements.sort((a, b) => (a.occurredOn === b.occurredOn ? 0 : a.occurredOn < b.occurredOn ? -1 : 1));
  }
}

function assertAddress(address: string): void {
  if (!isValidSolanaAddress(address)) {
    throw new Error(`"${address}" is not a valid Solana address.`);
  }
}
