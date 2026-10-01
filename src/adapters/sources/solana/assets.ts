/**
 * A readable asset holding: what the wallet holds, with the metadata an
 * operator needs (name, decimals, class) and a human amount. Built from the
 * normalized balances plus the mint registry. Native SOL is always known.
 */
import { formatMinor } from "@/ledger";
import type { NormalizedBalance } from "../../types";
import { SOL_CODE, type SolanaMint } from "./mints";

export interface AssetHolding {
  assetCode: string;
  name: string;
  decimals: number;
  /** Human amount, for display only. The exact figure is quantityMinor. */
  formatted: string;
  quantityMinor: bigint;
  asOf: string;
}

const SOL_ASSET: SolanaMint & { name: string } = { code: SOL_CODE, name: "Solana", decimals: 9 };

function describe(assetCode: string, registry?: ReadonlyMap<string, SolanaMint>): SolanaMint {
  if (assetCode === SOL_CODE) return SOL_ASSET;
  for (const mint of registry ?? []) {
    if (mint[1].code === assetCode) {
      return mint[1];
    }
  }
  return { code: assetCode, name: assetCode, decimals: 0 };
}

export function toAssetHoldings(
  balances: readonly NormalizedBalance[],
  registry?: ReadonlyMap<string, SolanaMint>,
): AssetHolding[] {
  return balances.map((balance) => {
    const asset = describe(balance.assetCode, registry);
    return {
      assetCode: asset.code,
      name: asset.name,
      decimals: asset.decimals,
      formatted: formatMinor(balance.quantityMinor, asset.decimals, { grouping: false }),
      quantityMinor: balance.quantityMinor,
      asOf: balance.asOf,
    };
  });
}
