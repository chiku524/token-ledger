/**
 * Sui object ids are 32-byte hex. Normalize the `0x`-prefix and lowercase.
 */

const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

export function isValidSuiAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return SUI_ADDRESS.test(value.trim());
}

/** Sui canonicalizes addresses to a 0x-prefixed, lowercased, 64-char hex. */
export function normalizeSuiAddress(value: string): string {
  if (!isValidSuiAddress(value)) {
    throw new Error(`"${value}" is not a valid Sui address.`);
  }
  return `0x${value.trim().slice(2).toLowerCase().padStart(64, "0")}`;
}
