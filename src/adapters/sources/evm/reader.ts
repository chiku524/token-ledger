/**
 * Read-only EVM reader. Composes the JSON-RPC client with the response mappers:
 * native and ERC-20 balances, and movements from Alchemy asset transfers. Falls
 * back to native-only balances when the endpoint has no enhanced methods. No
 * signing and no write method is ever called.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { isValidEvmAddress, normalizeEvmAddress } from "./address";
import type { EvmChain } from "./chains";
import type { AssetTransfer, AssetTransfersResult, TokenBalancesResult } from "./evm-responses";
import { mapEvmBalances } from "./map-balances";
import { mapTransfers } from "./map-transfers";
import type { EvmRpcClient } from "./rpc";
import { tokenContracts } from "./tokens";

const TRANSFER_CATEGORIES = ["external", "internal", "erc20"] as const;

export class EvmReader {
  constructor(
    private readonly chain: EvmChain,
    private readonly client: EvmRpcClient,
  ) {}

  async fetchBalances(address: string, now: Date = new Date()): Promise<NormalizedBalance[]> {
    const normalized = ensureAddress(address);
    const nativeHex = await this.client.call<string>("eth_getBalance", [normalized, "latest"]);

    // Always pass the registry contracts explicitly: the default address-only
    // call caps at a top-N list that can omit the tokens we track.
    let tokens: TokenBalancesResult | null = null;
    if (this.client.enhanced) {
      tokens = await this.client.call<TokenBalancesResult>("alchemy_getTokenBalances", [
        normalized,
        tokenContracts(this.chain),
      ]);
    }

    return mapEvmBalances(this.chain, nativeHex, tokens, now);
  }

  async fetchTransactions(address: string, since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const normalized = ensureAddress(address);
    if (!this.client.enhanced) {
      throw new Error(
        `Token transfers on ${this.chain.name} need an enhanced endpoint (set ALCHEMY_API_KEY or EVM_RPC_URL_${this.chain.key.toUpperCase()}).`,
      );
    }

    // Alchemy treats fromAddress + toAddress as an intersection (self-transfers
    // only), so query each direction and merge.
    const [outgoing, incoming] = await Promise.all([
      this.transfers({ fromAddress: normalized }),
      this.transfers({ toAddress: normalized }),
    ]);
    const transfers = [...outgoing, ...incoming];
    // A self-transfer appears in both directions; dedupe on the unique id so a
    // movement is never counted twice.
    const seen = new Set<string>();
    const unique = transfers.filter((transfer) => {
      if (seen.has(transfer.uniqueId)) return false;
      seen.add(transfer.uniqueId);
      return true;
    });

    return mapTransfers(this.chain, unique, normalized)
      .filter((movement) => movement.occurredOn >= since && (!until || movement.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0));
  }

  private async transfers(direction: { fromAddress?: string; toAddress?: string }): Promise<AssetTransfer[]> {
    const result = await this.client.call<AssetTransfersResult>("alchemy_getAssetTransfers", [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        ...direction,
        category: [...TRANSFER_CATEGORIES],
        withMetadata: true,
        maxCount: "0x64",
        order: "desc",
      },
    ]);
    return result.transfers;
  }
}

function ensureAddress(address: string): string {
  if (!isValidEvmAddress(address)) {
    throw new Error(`"${address}" is not a valid EVM address.`);
  }
  return normalizeEvmAddress(address);
}
