import { describe, expect, it } from "vitest";
import {
  authSecretConfigured,
  BITCOIN_PUBLIC_ESPLORA_URL,
  readAlchemyApiKey,
  readBitcoinEsploraUrl,
  readDatabaseUrl,
  readEvmRpcUrl,
  readSolanaRpcUrl,
  readSuiGraphqlUrl,
  reownProjectId,
  SOLANA_PUBLIC_RPC_URL,
  SUI_PUBLIC_GRAPHQL_URL,
} from "./env";

describe("authSecretConfigured", () => {
  it("requires at least 32 characters", () => {
    expect(authSecretConfigured({})).toBe(false);
    expect(authSecretConfigured({ AUTH_SECRET: "short" })).toBe(false);
    expect(authSecretConfigured({ AUTH_SECRET: "x".repeat(32) })).toBe(true);
  });
});

describe("reownProjectId", () => {
  it("stays off until a project id is set", () => {
    expect(reownProjectId({})).toBeNull();
    expect(reownProjectId({ NEXT_PUBLIC_REOWN_PROJECT_ID: "  " })).toBeNull();
    expect(reownProjectId({ NEXT_PUBLIC_REOWN_PROJECT_ID: "project" })).toBe("project");
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

describe("readAlchemyApiKey", () => {
  it("is null when unset and trimmed when set", () => {
    expect(readAlchemyApiKey({})).toBeNull();
    expect(readAlchemyApiKey({ ALCHEMY_API_KEY: "  " })).toBeNull();
    expect(readAlchemyApiKey({ ALCHEMY_API_KEY: " key " })).toBe("key");
  });
});

describe("readEvmRpcUrl", () => {
  it("is null when unset", () => {
    expect(readEvmRpcUrl("ethereum", {})).toBeNull();
  });

  it("reads a per-chain key and requires https without credentials", () => {
    expect(readEvmRpcUrl("ethereum", { EVM_RPC_URL_ETHEREUM: "https://eth.example.com" })).toBe("https://eth.example.com");
    expect(readEvmRpcUrl("polygon", { EVM_RPC_URL_POLYGON: "https://polygon.example.com" })).toBe("https://polygon.example.com");
    expect(() => readEvmRpcUrl("ethereum", { EVM_RPC_URL_ETHEREUM: "http://eth.example.com" })).toThrow(/https/i);
    expect(() => readEvmRpcUrl("ethereum", { EVM_RPC_URL_ETHEREUM: "https://u:p@eth.example.com" })).toThrow(/credentials/i);
  });
});

describe("readBitcoinEsploraUrl", () => {
  it("falls back to the keyless public Esplora instance and strips trailing slashes", () => {
    expect(readBitcoinEsploraUrl({})).toBe(BITCOIN_PUBLIC_ESPLORA_URL);
    expect(readBitcoinEsploraUrl({ BITCOIN_ESPLORA_URL: "  " })).toBe(BITCOIN_PUBLIC_ESPLORA_URL);
    expect(readBitcoinEsploraUrl({ BITCOIN_ESPLORA_URL: "https://esplora.example.com/api/" })).toBe("https://esplora.example.com/api");
  });

  it("requires https and rejects credentials", () => {
    expect(() => readBitcoinEsploraUrl({ BITCOIN_ESPLORA_URL: "http://esplora.example.com" })).toThrow(/https/i);
    expect(() => readBitcoinEsploraUrl({ BITCOIN_ESPLORA_URL: "https://u:p@esplora.example.com" })).toThrow(/credentials/i);
  });
});

describe("readSuiGraphqlUrl", () => {
  it("falls back to the keyless public GraphQL endpoint", () => {
    expect(readSuiGraphqlUrl({})).toBe(SUI_PUBLIC_GRAPHQL_URL);
    expect(readSuiGraphqlUrl({ SUI_RPC_URL: "  " })).toBe(SUI_PUBLIC_GRAPHQL_URL);
  });

  it("accepts an https override and rejects http or credentials", () => {
    expect(readSuiGraphqlUrl({ SUI_RPC_URL: "https://sui.example.com/graphql" })).toBe("https://sui.example.com/graphql");
    expect(() => readSuiGraphqlUrl({ SUI_RPC_URL: "http://sui.example.com" })).toThrow(/https/i);
    expect(() => readSuiGraphqlUrl({ SUI_RPC_URL: "https://u:p@sui.example.com" })).toThrow(/credentials/i);
  });
});
