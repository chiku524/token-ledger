import { describe, expect, it } from "vitest";
import { BooksWriteError } from "@/db/write";
import { balanceSnapshots, journalLines, reconciliationRecords, sourceTransactions } from "@/db/schema";
import { syncFailureMessage } from "./run-sync";

describe("syncFailureMessage", () => {
  it("shows our own write error verbatim", () => {
    expect(syncFailureMessage(new BooksWriteError("Unknown asset BTC."))).toBe("Unknown asset BTC.");
  });

  it("never leaks a raw driver or SQL error", () => {
    const driver = new Error(
      'Failed query: insert into "balance_snapshots" ("quantity_minor") values ($1)\nparams: 50831257414225175572574',
    );
    const message = syncFailureMessage(driver);
    expect(message).not.toContain("insert into");
    expect(message).not.toContain("50831257414225175572574");
    expect(message).toMatch(/could not be read/i);
  });

  it("handles a non-Error throw", () => {
    expect(syncFailureMessage("boom")).toMatch(/could not be read/i);
  });
});

describe("quantity column type", () => {
  it("is numeric(78,0), not bigint, so large EVM quantities fit", () => {
    // Postgres bigint maxes at ~9.2e18, which is only ~9.2 ETH at 18 decimals;
    // a real wallet can hold far more, so the column must be arbitrary precision.
    for (const column of [
      balanceSnapshots.quantityMinor,
      journalLines.quantityMinor,
      reconciliationRecords.quantityMinor,
      sourceTransactions.quantityMinor,
    ]) {
      expect(column.getSQLType()).toBe("numeric(78, 0)");
    }
    const fiftyThousandEth = BigInt("50831257414225175572574");
    expect(fiftyThousandEth > 9223372036854775807n).toBe(true);
  });
});
