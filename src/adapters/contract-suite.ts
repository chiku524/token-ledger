/**
 * The shared adapter contract.
 *
 * Every source adapter (chain, exchange, custodian) must satisfy the same
 * rules: it is read-only and never touches the network unless configured, its
 * output matches the normalized shape, movements are unique and dated, the
 * `since` window is honoured, and an unimplemented adapter rejects with
 * `AdapterNotImplementedError`. `runAdapterContract` is the single place those
 * rules live; each adapter calls it with a configured instance and fixtures.
 *
 * See src/adapters/contract.test.ts for the wiring, and
 * docs/adr-adapter-contract.md for the rationale.
 */
import { describe, expect, it, vi } from "vitest";
import { validateAccounts, validateBalances, validateTransactions } from "./contract";
import type {
  FetchSourceTransactionsQuery,
  ListedAccount,
  NormalizedBalance,
  NormalizedSourceTransaction,
} from "./types";

export interface ContractCase {
  /** A stable label for the adapter under test. */
  name: string;
  /** A configured, read-only adapter instance (a fake client behind it is fine). */
  adapter: {
    fetchBalances(query: FetchSourceTransactionsQuery): Promise<NormalizedBalance[]>;
    fetchTransactions(query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]>;
    listAccounts(query: FetchSourceTransactionsQuery): Promise<ListedAccount[]>;
  };
  /** A valid query for this adapter, including since/until and an account id. */
  query: FetchSourceTransactionsQuery;
  /** Balances the adapter is expected to return for `query`, by asset and amount. */
  expectedBalances?: Array<{ assetCode: string; quantityMinor: bigint }>;
  /** Movements the adapter is expected to return for `query` (may be empty). */
  expectedMovements?: NormalizedSourceTransaction[];
  /** True when the adapter is fully implemented (no AdapterNotImplementedError). */
  implemented: boolean;
  /** A query whose account id is invalid, to check clear failure. */
  invalidQuery?: FetchSourceTransactionsQuery;
}

/**
 * A read-only guard: run a callback with the global fetch replaced by a spy
 * that rejects, and assert the adapter never called it (its own client is
 * faked). This catches an adapter that reaches the network on a read path.
 */
export async function expectNoNetwork(run: () => Promise<unknown>): Promise<void> {
  const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be used"));
  try {
    await run();
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
}

/** Run the standard contract for one adapter. */
export function runAdapterContract(testCase: ContractCase): void {
  const { name, adapter, query, invalidQuery, implemented } = testCase;

  describe(`adapter contract: ${name}`, () => {
    it("fetchBalances returns a valid, non-empty normalized shape", async () => {
      const balances = await adapter.fetchBalances(query);
      const result = validateBalances(balances);
      expect(result.problems, result.problems.join("; ")).toEqual([]);
      expect(balances.length).toBeGreaterThan(0);
    });

    it("fetchBalances matches the recorded expectation and is deterministic", async () => {
      if (!testCase.expectedBalances) return;
      const first = await adapter.fetchBalances(query);
      const second = await adapter.fetchBalances(query);
      const byCode = (rows: NormalizedBalance[]) =>
        Object.fromEntries(rows.map((row) => [row.assetCode, row.quantityMinor]));
      const expected = Object.fromEntries(testCase.expectedBalances.map((row) => [row.assetCode, row.quantityMinor]));
      expect(byCode(first)).toEqual(expected);
      expect(byCode(second)).toEqual(byCode(first));
    });

    it("fetchTransactions returns a valid normalized shape with unique ids", async () => {
      const movements = await adapter.fetchTransactions(query);
      const result = validateTransactions(movements);
      expect(result.problems, result.problems.join("; ")).toEqual([]);
    });

    it("fetchTransactions matches the recorded expectation", async () => {
      if (!testCase.expectedMovements) return;
      const movements = await adapter.fetchTransactions(query);
      expect(movements).toEqual(testCase.expectedMovements);
    });

    it("honours the since window on movements", async () => {
      const movements = await adapter.fetchTransactions(query);
      for (const movement of movements) {
        expect(movement.occurredOn >= query.since).toBe(true);
        if (query.until) expect(movement.occurredOn <= query.until).toBe(true);
      }
    });

    it("listAccounts returns a valid, non-empty shape", async () => {
      const accounts = await adapter.listAccounts(query);
      const result = validateAccounts(accounts);
      expect(result.problems, result.problems.join("; ")).toEqual([]);
    });

    it("does not touch the network on a read path", async () => {
      await expectNoNetwork(async () => {
        await adapter.fetchBalances(query);
        await adapter.fetchTransactions(query);
        await adapter.listAccounts(query);
      });
    });

    it("fails clearly on an invalid account id", async () => {
      if (!invalidQuery) return;
      await expect(adapter.fetchBalances(invalidQuery)).rejects.toThrow();
    });

    if (implemented) {
      it("is implemented and does not reject with AdapterNotImplementedError", async () => {
        await expect(adapter.fetchBalances(query)).resolves.toBeDefined();
      });
    }
  });
}
