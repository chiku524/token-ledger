/**
 * EVM chain configuration. One reader serves every EVM chain; the differences
 * are the chain id, the native currency, and the endpoints. See
 * docs/adr-evm-data-source.md.
 */

export interface EvmChain {
  /** Lowercase chain key, matching the ledger's `assets.chain`. */
  key: string;
  /** EIP-155 chain id, required by Etherscan-style multi-chain endpoints. */
  chainId: number;
  name: string;
  /** Native currency code, as the ledger names it. */
  nativeCode: string;
  /** Native currency decimals. 18 on every chain we support so far. */
  nativeDecimals: number;
  /** Keyless public JSON-RPC endpoint, used for native balance only. */
  publicRpcUrl: string;
  /** Alchemy subdomain, e.g. `eth-mainnet`. */
  alchemyNetwork: string;
}

export const EVM_CHAINS: ReadonlyMap<string, EvmChain> = new Map<string, EvmChain>([
  [
    "ethereum",
    {
      key: "ethereum",
      chainId: 1,
      name: "Ethereum",
      nativeCode: "ETH",
      nativeDecimals: 18,
      publicRpcUrl: "https://ethereum-rpc.publicnode.com",
      alchemyNetwork: "eth-mainnet",
    },
  ],
  [
    "polygon",
    {
      key: "polygon",
      chainId: 137,
      name: "Polygon",
      nativeCode: "POL",
      nativeDecimals: 18,
      publicRpcUrl: "https://polygon-bor-rpc.publicnode.com",
      alchemyNetwork: "polygon-mainnet",
    },
  ],
]);

export function evmChain(key: string): EvmChain | null {
  return EVM_CHAINS.get(key) ?? null;
}
