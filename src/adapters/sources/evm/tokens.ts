/**
 * EVM token identity. ERC-20 tokens are identified by contract address. A small
 * registry maps well-known contracts to the asset code and decimals the ledger
 * uses, per chain. Unknown contracts are skipped rather than guessed.
 *
 * Keys are lowercased because RPC providers return lowercased addresses.
 */
import type { EvmChain } from "./chains";

export interface EvmToken {
  code: string;
  name: string;
  decimals: number;
}

function registry(entries: Array<[string, EvmToken]>): ReadonlyMap<string, EvmToken> {
  return new Map(entries.map(([address, token]) => [address.toLowerCase(), token]));
}

export const EVM_TOKENS: ReadonlyMap<string, ReadonlyMap<string, EvmToken>> = new Map([
  [
    "ethereum",
    registry([
      ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", { code: "USDC", name: "USD Coin", decimals: 6 }],
      ["0xdAC17F958D2ee523a2206206994597C13D831ec7", { code: "USDT", name: "Tether USD", decimals: 6 }],
      ["0x6B175474E89094C44Da98b954EedeAC495271d0F", { code: "DAI", name: "Dai Stablecoin", decimals: 18 }],
      ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", { code: "WETH", name: "Wrapped Ether", decimals: 18 }],
    ]),
  ],
  [
    "polygon",
    registry([
      ["0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", { code: "USDC", name: "USD Coin", decimals: 6 }],
      ["0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", { code: "USDC", name: "USD Coin (PoS)", decimals: 6 }],
      ["0xc2132D05D31c914a87C6611C10748AEb04B58e8F", { code: "USDT", name: "Tether USD (PoS)", decimals: 6 }],
      ["0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", { code: "DAI", name: "Dai Stablecoin (PoS)", decimals: 18 }],
      ["0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", { code: "WETH", name: "Wrapped Ether (PoS)", decimals: 18 }],
    ]),
  ],
]);

export function resolveToken(chain: EvmChain, contractAddress: string): EvmToken | null {
  return EVM_TOKENS.get(chain.key)?.get(contractAddress.toLowerCase()) ?? null;
}

/** Find a registered token on a chain by its ledger asset code. */
export function tokenByCode(chain: EvmChain, code: string): EvmToken | null {
  for (const token of EVM_TOKENS.get(chain.key)?.values() ?? []) {
    if (token.code === code) return token;
  }
  return null;
}

/**
 * The contract addresses registered on a chain. Passing these explicitly to
 * `alchemy_getTokenBalances` avoids the provider's default top-N cap, which can
 * omit the tokens we track.
 */
export function tokenContracts(chain: EvmChain): string[] {
  return [...(EVM_TOKENS.get(chain.key)?.keys() ?? [])];
}
