/**
 * A real Solana transport over JSON-RPC: simulate, send and check finality. It is
 * deliberately dependency-free (plain `fetch`), so it can be constructed on the
 * server without pulling `@solana/web3.js` into a Worker bundle. The wire format
 * is base64, which is what the RPC's `simulateTransaction`/`sendTransaction`
 * accept and what the wallet signs.
 *
 * The boundary keeps the rules; this only moves bytes. It never signs.
 */
import type { ConfirmationResult, Signature, SimulationResult, SolanaTransport } from "./types";

interface RpcErrorShape {
  code: number;
  message: string;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: RpcErrorShape;
}

export interface RpcTransportOptions {
  url: string;
  cluster: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class RpcSolanaTransport implements SolanaTransport {
  readonly cluster: string;
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private nextId = 1;

  constructor(options: RpcTransportOptions) {
    this.url = options.url;
    this.cluster = options.cluster;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new Error(`Solana RPC ${method} ${reason}.`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Solana RPC ${method} returned HTTP ${response.status}.`);
    const body = (await response.json()) as JsonRpcResponse<T>;
    if (body.error) throw new Error(`Solana RPC ${method} error: ${body.error.message}`);
    if (body.result === undefined) throw new Error(`Solana RPC ${method} returned no result.`);
    return body.result;
  }

  /** The latest blockhash, for building a message. */
  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const result = await this.call<{ value: { blockhash: string; lastValidBlockHeight: number } }>(
      "getLatestBlockhash",
      [{ commitment: "finalized" }],
    );
    return result.value;
  }

  /** The current finalized slot height, for the indexer's backfill bound. */
  async getFinalizedSlot(): Promise<bigint> {
    const slot = await this.call<number>("getSlot", [{ commitment: "finalized" }]);
    return BigInt(slot);
  }

  /**
   * Recent signatures that touched an address (a program id, for the indexer),
   * newest first. Paginate with `before` for older pages.
   */
  async getSignaturesForAddress(
    address: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<Array<{ signature: string; slot: number; blockTime: number | null }>> {
    const params: Array<Record<string, unknown>> = [{ limit: options.limit ?? 100, commitment: "finalized" }];
    if (options.before) params[0]!.before = options.before;
    return this.call<Array<{ signature: string; slot: number; blockTime: number | null }>>(
      "getSignaturesForAddress",
      [address, params[0]!],
    );
  }

  /** A finalized transaction's logs and slot, for event decoding. */
  async getTransactionLogs(
    signature: string,
  ): Promise<{ slot: number; blockTime: number | null; logs: string[] } | null> {
    const result = await this.call<{
      slot: number;
      blockTime: number | null;
      meta: { logMessages: string[] | null; err: unknown } | null;
    } | null>("getTransaction", [signature, { encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0 }]);
    if (!result) return null;
    return { slot: result.slot, blockTime: result.blockTime, logs: result.meta?.logMessages ?? [] };
  }

  /**
   * Simulate. `sigVerify: false` so an unsigned message can be checked before a
   * signature. A revert is reported, not thrown: it is an expected outcome.
   */
  async simulate(wireTransactionBase64: string): Promise<SimulationResult> {
    const result = await this.call<{
      value: { err: unknown; logs: string[] | null; unitsConsumed?: number };
    }>("simulateTransaction", [
      wireTransactionBase64,
      { encoding: "base64", sigVerify: false, commitment: "confirmed" },
    ]);
    const value = result.value;
    const ok = value.err === null || value.err === undefined;
    return {
      ok,
      logs: value.logs ?? [],
      unitsConsumed: value.unitsConsumed,
      error: ok ? undefined : JSON.stringify(value.err),
    };
  }

  /** Send a signed wire transaction. Returns its base58 signature. */
  async send(wireTransactionBase64: string): Promise<Signature> {
    return this.call<Signature>("sendTransaction", [
      wireTransactionBase64,
      { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
    ]);
  }

  /**
   * Map the RPC confirmation status to the boundary's vocabulary. Only a
   * `finalized` commitment is "finalized"; anything else is not settled evidence.
   */
  async confirmationStatus(signature: Signature): Promise<ConfirmationResult> {
    const result = await this.call<{
      value: Array<{ confirmationStatus?: string; err: unknown; slot: number } | null>;
    }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
    const entry = result.value[0];
    if (!entry) return { signature, status: "failed", error: "unknown signature" };
    // An entry with no confirmationStatus is processed but not yet confirmed.
    const status = entry.confirmationStatus;
    if (entry.err !== null && entry.err !== undefined) {
      return { signature, status: "failed", slot: entry.slot, error: JSON.stringify(entry.err) };
    }
    if (status === "finalized") return { signature, status: "finalized", slot: entry.slot };
    if (status === "confirmed" || status === "processed") return { signature, status: "confirmed", slot: entry.slot };
    return { signature, status: "expired", slot: entry.slot };
  }
}
