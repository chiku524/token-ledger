/**
 * Sui amounts arrive as unsigned decimal strings of the smallest unit. Convert
 * to bigint minor units exactly; never through a number.
 */
export function decimalStringToMinorUnits(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error("Amount is empty.");
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`"${value}" is not a non-negative integer amount.`);
  }
  return BigInt(trimmed);
}

/** A balance change may be negative. */
export function signedDecimalToMinorUnits(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed.startsWith("-")) {
    return -decimalStringToMinorUnits(trimmed.slice(1));
  }
  return decimalStringToMinorUnits(trimmed);
}
