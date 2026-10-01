import { describe, expect, it } from "vitest";
import { decodeBase58, isValidSolanaAddress } from "./address";

// A real mainnet account, used only as an address-shape fixture.
const REAL = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

describe("isValidSolanaAddress", () => {
  it("accepts a real 32-byte public key", () => {
    expect(isValidSolanaAddress(REAL)).toBe(true);
  });

  it("rejects wrong lengths and non-base58 characters", () => {
    expect(isValidSolanaAddress("")).toBe(false);
    expect(isValidSolanaAddress("abc")).toBe(false);
    expect(isValidSolanaAddress(`${REAL}1`)).toBe(false);
    expect(isValidSolanaAddress("0OIl")).toBe(false);
    expect(isValidSolanaAddress("x".repeat(45))).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidSolanaAddress(undefined)).toBe(false);
    expect(isValidSolanaAddress(42)).toBe(false);
    expect(isValidSolanaAddress({})).toBe(false);
  });

  it("decodes a known value to 32 bytes", () => {
    expect(decodeBase58(REAL)).toHaveLength(32);
  });

  it("keeps leading zero bytes", () => {
    // "1" is a single leading zero byte.
    expect(decodeBase58("1")).toEqual(Uint8Array.from([0]));
  });
});
