/**
 * EVM amounts. Native balances arrive as a hex string of wei; ERC-20 balances
 * arrive as a 0x-prefixed 32-byte hex string of the raw token amount. Both are
 * integers in the smallest unit, so decode them to bigint minor units exactly.
 */

/** Convert a 0x-prefixed hex integer (or decimal string) to minor units. */
export function hexToMinorUnits(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error("Amount is empty.");
  if (trimmed.startsWith("-")) throw new Error("Amount cannot be negative.");
  const isHex = /^0x[0-9a-fA-F]+$/.test(trimmed);
  if (!isHex && !/^\d+$/.test(trimmed)) {
    throw new Error(`"${value}" is not a hex or decimal integer amount.`);
  }
  return BigInt(trimmed);
}

/** A zero balance is a real observation. */
export function isZeroAmount(value: string): boolean {
  return hexToMinorUnits(value) === 0n;
}
