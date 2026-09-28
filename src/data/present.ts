import { formatMinor } from "@/ledger";
import { assetByCode, entityById, exampleBooks, sourceById } from "./example-books";

const FIAT_DECIMALS: Record<string, number> = { MYR: 2, SGD: 2, USD: 2 };

export function formatMoney(amountMinor: bigint, currency: string): string {
  const scale = FIAT_DECIMALS[currency];
  if (scale === undefined) {
    throw new Error(`No display scale configured for ${currency}.`);
  }
  return `${currency} ${formatMinor(amountMinor, scale, { minFraction: scale, maxFraction: scale })}`;
}

export function formatQuantity(quantityMinor: bigint, assetCode: string): string {
  const asset = assetByCode(assetCode);
  const scale = asset?.decimals ?? 0;
  const maxFraction = Math.min(8, scale);
  return `${formatMinor(quantityMinor, scale, { minFraction: 0, maxFraction })} ${assetCode}`;
}

export function entityName(id: string): string {
  return entityById(id)?.name ?? id;
}

export function sourceName(id: string): string {
  return sourceById(id)?.name ?? id;
}

export function accountLabel(entityId: string, code: string): string {
  const account = exampleBooks.accounts.find((item) => item.entityId === entityId && item.code === code);
  return account ? `${account.code} ${account.name}` : code;
}
