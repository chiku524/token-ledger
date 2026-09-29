import { describe, expect, it } from "vitest";
import { readDatabaseUrl } from "./env";

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
