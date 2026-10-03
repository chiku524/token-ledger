import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodeActivateMandate,
  encodeCollectCycle,
  encodeCreatePlanVersion,
  encodeDeposit,
  encodeInitializeMerchant,
  encodeReplaceMandate,
  encodeSetCollectionPause,
  encodeWithdraw,
  SERVICE_BALANCE_DISCRIMINATORS,
} from "./instructions";

const IDL = JSON.parse(
  readFileSync(join(process.cwd(), "contracts", "idl", "service_balance.json"), "utf8"),
) as { instructions: { name: string; discriminator: number[] }[] };

describe("discriminators match the committed IDL", () => {
  for (const instruction of IDL.instructions) {
    it(instruction.name, () => {
      const pinned = (SERVICE_BALANCE_DISCRIMINATORS as Record<string, readonly number[]>)[instruction.name];
      expect(pinned, `${instruction.name} is not pinned`).toBeDefined();
      expect([...pinned!]).toEqual(instruction.discriminator);
    });
  }
});

describe("argument encoding", () => {
  const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const DEST = "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp";

  it("encodes initialize_merchant as discriminator then three pubkeys", () => {
    const data = encodeInitializeMerchant({ mint: MINT, tokenProgram: TOKEN, destination: DEST });
    expect(data.length).toBe(8 + 32 * 3);
  });

  it("encodes boolean and u64 args little-endian", () => {
    expect([...encodeSetCollectionPause(true).slice(8)]).toEqual([1]);
    expect([...encodeDeposit(1n).slice(8)]).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect([...encodeWithdraw(0x0102030405060708n).slice(8)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect([...encodeCollectCycle(2n).slice(8)]).toEqual([2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("encodes a signed i64 expiry two's-complement", () => {
    // i64 max and -1 round-trip.
    expect([...encodeActivateMandate({ maxTotalDebit: 0n, authorizationExpiry: -1n }).slice(16)]).toEqual(
      [255, 255, 255, 255, 255, 255, 255, 255],
    );
  });

  it("encodes plan_id(16) + version(u16) + price(u64) + max_periods(u32)", () => {
    const data = encodeCreatePlanVersion({ planId: new Uint8Array(16).fill(7), version: 1, price: 20_000_000n, maxPeriods: 5 });
    // 8 disc + 16 planId | 2 version | 8 price | 4 maxPeriods.
    expect(data.length).toBe(8 + 16 + 2 + 8 + 4);
    expect([...data.slice(8, 24)]).toEqual(new Array(16).fill(7));
    expect([...data.slice(24, 26)]).toEqual([1, 0]); // version 1
    expect([...data.slice(26, 34)]).toEqual([0, 45, 49, 1, 0, 0, 0, 0]); // 20_000_000 LE
    expect([...data.slice(34, 38)]).toEqual([5, 0, 0, 0]);
  });

  it("encodes replace_mandate like activate but with a different discriminator", () => {
    const activate = encodeActivateMandate({ maxTotalDebit: 40_000_000n, authorizationExpiry: 1_000n });
    const replace = encodeReplaceMandate({ maxTotalDebit: 40_000_000n, authorizationExpiry: 1_000n });
    expect([...replace.slice(8)]).toEqual([...activate.slice(8)]);
    expect([...replace.slice(0, 8)]).not.toEqual([...activate.slice(0, 8)]);
  });
});
