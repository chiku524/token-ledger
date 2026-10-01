/**
 * Solana addresses are base58-encoded 32-byte public keys. There is no
 * checksum, so validation decodes and checks the byte length.
 */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PUBKEY_BYTES = 32;
// A 32-byte value encodes to at most 44 base58 characters.
const MAX_LENGTH = 44;

export function isValidSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_LENGTH) return false;
  try {
    return decodeBase58(value).length === PUBKEY_BYTES;
  } catch {
    return false;
  }
}

export function decodeBase58(value: string): Uint8Array {
  let number = 0n;
  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error(`"${character}" is not a base58 character.`);
    }
    number = number * 58n + BigInt(index);
  }

  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number % 256n));
    number /= 256n;
  }

  let leadingZeros = 0;
  for (const character of value) {
    if (character !== "1") break;
    leadingZeros += 1;
  }

  const leading = new Array<number>(leadingZeros).fill(0);
  return Uint8Array.from([...leading, ...bytes]);
}
