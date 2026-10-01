import { describe, expect, it } from "vitest";
import { authSecretConfigured, readDatabaseUrl, readSolanaRpcUrl, SOLANA_PUBLIC_RPC_URL } from "./env";

describe("authSecretConfigured", () => {
  it("requires at least 32 characters", () => {
    expect(authSecretConfigured({})).toBe(false);
    expect(authSecretConfigured({ AUTH_SECRET: "short" })).toBe(false);
    expect(authSecretConfigured({ AUTH_SECRET: "x".repeat(32) })).toBe(true);
  });
});

describe("readDatabaseUrl", () => {
  it("treats a missing value as the example-books path", () => {
    expect(readDatabaseUrl({})).toBeNull();
    expect(readDatabaseUrl({ DATABASE_URL: "  " })).toBeNull();
  });

  it("accepts a postgres URL and rejects anything else", () => {
    expect(readDatabaseUrl({ DATABASE_URL: "postgres://localhost/token_ledger" })).toBe("postgres://localhost/token_ledger");
    expect(readDatabaseUrl({ DATABASE_URL: "postgresql://localhost/token_ledger" })).toContain("postgresql://");
    expect(() => readDatabaseUrl({ DATABASE_URL: "mysql://localhost/token_ledger" })).toThrow(/postgres/i);
  });
});

describe("readSolanaRpcUrl", () => {
  it("falls back to the keyless public cluster", () => {
    expect(readSolanaRpcUrl({})).toBe(SOLANA_PUBLIC_RPC_URL);
    expect(readSolanaRpcUrl({ SOLANA_RPC_URL: "  " })).toBe(SOLANA_PUBLIC_RPC_URL);
  });

  it("accepts an https override and requires https", () => {
    expect(readSolanaRpcUrl({ SOLANA_RPC_URL: "https://solana-mainnet.example.com" })).toBe("https://solana-mainnet.example.com");
    expect(() => readSolanaRpcUrl({ SOLANA_RPC_URL: "http://solana-mainnet.example.com" })).toThrow(/https/i);
  });

  it("rejects credentials embedded in the URL", () => {
    expect(() => readSolanaRpcUrl({ SOLANA_RPC_URL: "https://user:secret@example.com" })).toThrow(/credentials/i);
  });
});
