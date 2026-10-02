/**
 * Minor-unit helpers. Parsing and formatting never go through Number.
 */

const GROUPING = /\B(?=(\d{3})+(?!\d))/g;

export function toMinor(amount: string, scale: number): bigint {
  assertScale(scale);
  const negative = amount.startsWith("-");
  const raw = negative ? amount.slice(1) : amount;
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid decimal amount "${amount}".`);
  }
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > scale) {
    throw new Error(`"${amount}" has more than ${scale} decimal places.`);
  }
  const padded = fraction.padEnd(scale, "0");
  const minor = BigInt(whole) * 10n ** BigInt(scale) + BigInt(padded === "" ? "0" : padded);
  return negative ? -minor : minor;
}

/**
 * Parse a decimal amount and round it to `scale` minor units, half-up away from
 * zero. Used for provider values (prices, rates) that carry more decimals than
 * the target scale, so they never pass through a binary float.
 */
export function toMinorRounded(amount: string, scale: number): bigint {
  assertScale(scale);
  const negative = amount.startsWith("-");
  const raw = negative ? amount.slice(1) : amount;
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid decimal amount "${amount}".`);
  }
  const [whole, fraction = ""] = raw.split(".");
  const kept = fraction.slice(0, scale).padEnd(scale, "0");
  const nextDigit = fraction.charCodeAt(scale) - 48;
  let minor = BigInt(whole) * 10n ** BigInt(scale) + BigInt(kept === "" ? "0" : kept);
  if (nextDigit >= 5) minor += 1n;
  return negative ? -minor : minor;
}

export function formatMinor(
  amountMinor: bigint,
  scale: number,
  options?: { minFraction?: number; maxFraction?: number; grouping?: boolean },
): string {
  assertScale(scale);
  const maxFraction = options?.maxFraction ?? scale;
  const minFraction = options?.minFraction ?? 0;
  if (
    !Number.isInteger(minFraction) ||
    !Number.isInteger(maxFraction) ||
    minFraction < 0 ||
    maxFraction < minFraction ||
    maxFraction > scale
  ) {
    throw new Error("Invalid fraction options.");
  }

  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const base = 10n ** BigInt(scale);
  const whole = absolute / base;
  const fraction = absolute % base;
  let digits = scale === 0 ? "" : fraction.toString().padStart(scale, "0");

  if (digits.length > maxFraction) {
    const hidden = digits.slice(maxFraction);
    const hidesValue = [...hidden].some((digit) => digit !== "0");
    if (!hidesValue) digits = digits.slice(0, maxFraction);
  }

  while (digits.length > minFraction && digits.endsWith("0")) {
    digits = digits.slice(0, -1);
  }

  const wholeText =
    options?.grouping === false ? whole.toString() : whole.toString().replace(GROUPING, ",");
  const body = digits.length > 0 ? `${wholeText}.${digits}` : wholeText;
  return negative ? `-${body}` : body;
}

/**
 * Major units for a chart axis. Fiat scales used here are exact in IEEE numbers;
 * amounts whose whole part exceeds Number.MAX_SAFE_INTEGER are rejected.
 */
export function minorToNumber(amountMinor: bigint, scale: number): number {
  assertScale(scale);
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const base = 10n ** BigInt(scale);
  const whole = absolute / base;
  const fraction = absolute % base;
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large to plot exactly.");
  }
  const value = Number(whole) + Number(fraction) / Number(base);
  return negative ? -value : value;
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 36) {
    throw new Error(`Invalid scale ${scale}.`);
  }
}
