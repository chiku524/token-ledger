import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodeInitializeTreasury,
  encodeProposeGovernance,
  encodeProposePayment,
  MAX_APPROVERS,
  TREASURY_PAYABLES_DISCRIMINATORS,
} from "./instructions";

const IDL = JSON.parse(
  readFileSync(join(process.cwd(), "contracts", "idl", "treasury_payables.json"), "utf8"),
) as { instructions: { name: string; discriminator: number[] }[] };

const A = "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp";
const B = "HGkuzNQECFbbyKpANTufU1ppBBDaYnTCFaoVUYqrfFYR";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("treasury discriminators match the committed IDL", () => {
  for (const instruction of IDL.instructions) {
    it(instruction.name, () => {
      const pinned = (TREASURY_PAYABLES_DISCRIMINATORS as Record<string, readonly number[]>)[instruction.name];
      expect(pinned, `${instruction.name} is not pinned`).toBeDefined();
      expect([...pinned!]).toEqual(instruction.discriminator);
    });
  }
});

describe("treasury argument encoding", () => {
  it("encodes initialize_treasury with Vec lengths and a padded new-approver array", () => {
    const data = encodeInitializeTreasury({
      entity: A,
      mint: MINT,
      tokenProgram: TOKEN,
      threshold: 2,
      approvers: [A, B],
      proposers: [A],
      perPaymentLimit: 500_000_000n,
      dailyLimit: 1_000_000_000n,
      maxProposalLifetime: 3600n,
      recovery: A,
    });
    // 8 disc + entity + mint + token (3*32) + threshold(1) + vec(4+2*32) + vec(4+32) + 8+8+8 + recovery(32)
    expect(data.length).toBe(8 + 96 + 1 + 68 + 36 + 24 + 32);
    // approvers vec length is 2, right after the threshold byte.
    expect([...data.slice(105, 109)]).toEqual([2, 0, 0, 0]);
  });

  it("encodes propose_payment invoice_key + revision + recipient + amount", () => {
    const data = encodeProposePayment({
      invoiceKey: new Uint8Array(32).fill(3),
      revision: 1,
      recipientOwner: B,
      grossAmount: 500_000_000n,
    });
    expect(data.length).toBe(8 + 32 + 4 + 32 + 8);
    expect([...data.slice(40, 44)]).toEqual([1, 0, 0, 0]);
  });

  it("encodes propose_governance kind byte and a fixed 10-pubkey array", () => {
    const data = encodeProposeGovernance({
      kind: "EmergencyExit",
      newThreshold: 0,
      newApproverCount: 0,
      newApprovers: [],
      newPerPaymentLimit: 0n,
      newDailyLimit: 0n,
      newRecovery: A,
    });
    // kind byte is 2 for EmergencyExit, right after the discriminator.
    expect(data[8]).toBe(2);
    // 8 disc + kind(1) + threshold(1) + approverCount(1) + 10*32 + 8 + 8 + 32
    expect(data.length).toBe(8 + 3 + 10 * 32 + 8 + 8 + 32);
  });

  it("rejects more than the maximum approvers", () => {
    expect(() =>
      encodeProposeGovernance({
        kind: "PolicyChange",
        newThreshold: 1,
        newApproverCount: MAX_APPROVERS + 1,
        newApprovers: new Array(MAX_APPROVERS + 1).fill(A),
        newPerPaymentLimit: 1n,
        newDailyLimit: 1n,
        newRecovery: A,
      }),
    ).toThrow(/approvers/i);
  });
});
