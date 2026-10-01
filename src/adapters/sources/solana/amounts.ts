/**
 * Solana amounts already arrive as integers in the smallest unit: lamports for
 * SOL and raw amounts for SPL tokens. The ledger stores the same integer as
 * bigint minor units, so the mapping is a validated conversion, never a
 * floating-point one.
 */

/** SOL uses 9 decimals, so one lamport is one minor unit. */
export const SOL_DECIMALS = 9;

/**
 * Convert a raw on-chain amount to minor units.
 *
 * Accepts a decimal string (preferred, exact), a bigint, or a safe integer.
 * A JSON number above `Number.MAX_SAFE_INTEGER` is rejected rather than
 * silently rounded, because the RPC may already have lost precision.
 */
export function toMinorUnits(rawAmount: string | number | bigint): bigint {
  if (typeof rawAmount === "bigint") {
    if (rawAmount < 0n) throw new Error("Amount cannot be negative.");
    return rawAmount;
  }

  if (typeof rawAmount === "number") {
    if (!Number.isInteger(rawAmount)) throw new Error("Amount must be an integer.");
    if (!Number.isSafeInteger(rawAmount)) {
      throw new Error("Amount exceeds the safe integer range; use a string.");
    }
    if (rawAmount < 0) throw new Error("Amount cannot be negative.");
    return BigInt(rawAmount);
  }

  if (typeof rawAmount === "string") {
    if (!/^\d+$/.test(rawAmount)) {
      throw new Error(`"${rawAmount}" is not a non-negative integer amount.`);
    }
    return BigInt(rawAmount);
  }

  throw new Error("Unrecognized amount.");
}
