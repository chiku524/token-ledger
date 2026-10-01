/**
 * Bitcoin amounts are integers in satoshis. One BTC is 100,000,000 satoshis,
 * so a satoshi is one minor unit and decoding is a plain integer conversion.
 */

export const BTC_DECIMALS = 8;
export const SATOSHIS_PER_BTC = 100_000_000n;

/** Esplora returns satoshis as a JSON number. */
export function satoshisToMinor(value: number): bigint {
  if (!Number.isInteger(value)) throw new Error("Satoshi amount must be an integer.");
  if (!Number.isSafeInteger(value)) {
    throw new Error("Satoshi amount exceeds the safe integer range.");
  }
  return BigInt(value);
}
