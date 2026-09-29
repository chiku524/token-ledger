import { formatMinor } from "@/ledger";
import { assetByCode, entityById, exampleAccounts, exampleAssets, exampleBooks, exampleEntities, exampleSources, sourceById } from "./example-books";

const FIAT_DECIMALS: Record<string, number> = { MYR: 2, SGD: 2, USD: 2 };

export function formatMoney(amountMinor: bigint, currency: string): string {
  const scale = FIAT_DECIMALS[currency];
  if (scale === undefined) {
    throw new Error(`No display scale configured for ${currency}.`);
  }
  return `${currency} ${formatMinor(amountMinor, scale, { minFraction: scale, maxFraction: scale })}`;
}

export function formatQuantity(
  quantityMinor: bigint,
  assetCode: string,
  assets: readonly { code: string; decimals: number }[] = exampleAssets,
): string {
  const asset = assets.find((item) => item.code === assetCode) ?? assetByCode(assetCode);
  const scale = asset?.decimals ?? 0;
  const maxFraction = Math.min(8, scale);
  return `${formatMinor(quantityMinor, scale, { minFraction: 0, maxFraction })} ${assetCode}`;
}

export function entityName(id: string, entities: readonly { id: string; name: string }[] = exampleEntities): string {
  return entities.find((entity) => entity.id === id)?.name ?? entityById(id)?.name ?? id;
}

export function sourceName(id: string, sources: readonly { id: string; name: string }[] = exampleSources): string {
  return sources.find((source) => source.id === id)?.name ?? sourceById(id)?.name ?? id;
}

export function accountLabel(
  entityId: string,
  code: string,
  accounts: readonly { entityId: string; code: string; name: string }[] = exampleAccounts,
): string {
  const account = accounts.find((item) => item.entityId === entityId && item.code === code)
    ?? exampleBooks.accounts.find((item) => item.entityId === entityId && item.code === code);
  return account ? `${account.code} ${account.name}` : code;
}
