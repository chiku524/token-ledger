/**
 * EVM addresses are 20 bytes, written as 0x + 40 hex characters. Checksums
 * (EIP-55) are case-based, so accept any case; the canonical form is lowercase.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isValidEvmAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS.test(value);
}

export function normalizeEvmAddress(value: string): string {
  if (!isValidEvmAddress(value)) {
    throw new Error(`"${value}" is not a valid EVM address.`);
  }
  return value.toLowerCase();
}
