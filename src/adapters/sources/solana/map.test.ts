import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NormalizedBalance } from "../../types";
import { mapBalancesToObservations } from "./map-balances";
import { mapTransactionToMovements } from "./map-transactions";
import type { BalanceResult, ParsedTransaction, TokenAccountsResult } from "./solana-responses";

const WATCHED = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const SIGNATURE = "dbgBYvBgDQpQe1quxuqpHZutddyxqdRbog1F4X7LHvGKUWfTWA3grHqafXhTfTEgwx6MvPBcMsUnbb9Ea4djvAZ";

function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const balance = fixture<{ result: BalanceResult }>("balance.json").result;
const tokens = fixture<{ result: TokenAccountsResult }>("tokens.json").result;
const tx = fixture<{ result: ParsedTransaction }>("transaction.json").result;

const observedAt = new Date("2026-06-30T00:00:00.000Z");

describe("mapBalancesToObservations", () => {
  it("reads native SOL and skips unknown mints by default", () => {
    const rows = mapBalancesToObservations(balance, tokens, observedAt);
    expect(rows).toEqual<NormalizedBalance[]>([
      { assetCode: "SOL", quantityMinor: BigInt(balance.value), asOf: observedAt.toISOString() },
    ]);
  });

  it("includes an SPL token once its mint is registered", () => {
    const firstMint = tokens.value[0]!.account.data.parsed.info.mint;
    const registry = new Map([[firstMint, { code: "TOK", decimals: 6 }]]);
    const rows = mapBalancesToObservations(balance, tokens, observedAt, registry);
    const byCode = Object.fromEntries(rows.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.SOL).toBe(BigInt(balance.value));
    expect(byCode.TOK).toBe(23000004000000n);
  });

  it("keeps a real zero native observation instead of dropping it", () => {
    const zero: BalanceResult = { context: balance.context, value: 0 };
    const rows = mapBalancesToObservations(zero, { context: tokens.context, value: [] }, observedAt);
    expect(rows).toEqual([{ assetCode: "SOL", quantityMinor: 0n, asOf: observedAt.toISOString() }]);
  });
});

describe("mapTransactionToMovements", () => {
  it("reads the native SOL delta, including the fee", () => {
    const rows = mapTransactionToMovements(SIGNATURE, tx, WATCHED);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    const expected = BigInt(tx.meta!.postBalances[0]!) - BigInt(tx.meta!.preBalances[0]!);
    expect(row?.assetCode).toBe("SOL");
    expect(row?.direction).toBe("out");
    expect(row?.quantityMinor).toBe(-expected);
    expect(row?.externalId).toBe(`${SIGNATURE}:SOL`);
    expect(row?.chain).toBe("solana");
    expect(row?.occurredOn).toBe(new Date(tx.blockTime! * 1000).toISOString().slice(0, 10));
  });

  it("reads an SPL token delta from a synthetic transaction", () => {
    const spl = syntheticTransaction({
      pre: "1000000",
      post: "2500000",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
    const rows = mapTransactionToMovements("sig-spl", spl, WATCHED);
    expect(rows).toEqual([
      expect.objectContaining({ assetCode: "USDC", direction: "in", quantityMinor: 1500000n, externalId: "sig-spl:USDC" }),
    ]);
  });

  it("ignores failed transactions", () => {
    const failed = { ...tx, meta: { ...tx.meta!, err: { InstructionError: [0, "Custom"] } } };
    expect(mapTransactionToMovements(SIGNATURE, failed, WATCHED)).toEqual([]);
  });

  it("produces no movement when the address is not involved", () => {
    expect(mapTransactionToMovements(SIGNATURE, tx, "11111111111111111111111111111111")).toEqual([]);
  });

  it("produces no movement for a net-zero change", () => {
    const selfTransfer = { ...tx, meta: { ...tx.meta!, postBalances: [...tx.meta!.preBalances] } };
    expect(mapTransactionToMovements(SIGNATURE, selfTransfer, WATCHED)).toEqual([]);
  });
});

function syntheticTransaction({ pre, post, mint }: { pre: string; post: string; mint: string }): ParsedTransaction {
  const amount = (value: string) => ({ amount: value, decimals: 6, uiAmount: Number(value) / 1e6, uiAmountString: value });
  return {
    blockTime: tx.blockTime,
    slot: tx.slot,
    meta: {
      err: null,
      fee: tx.meta!.fee,
      preBalances: [...tx.meta!.preBalances],
      postBalances: [...tx.meta!.preBalances],
      preTokenBalances: [{ accountIndex: 0, mint, uiTokenAmount: amount(pre) }],
      postTokenBalances: [{ accountIndex: 0, mint, uiTokenAmount: amount(post) }],
    },
    transaction: tx.transaction,
  };
}
