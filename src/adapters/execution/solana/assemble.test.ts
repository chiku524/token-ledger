import { describe, expect, it } from "vitest";
import { VersionedTransaction } from "@solana/web3.js";
import { encodeDeposit } from "@/contracts/instructions";
import { assembleTransaction, buildTransaction, toTransactionInstructions } from "./assemble";
import type { PlannedInstruction } from "@/billing/service";

const PROGRAM = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";
const PAYER = "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp";
const BLOCKHASH = "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM";

function depositInstruction(): PlannedInstruction {
  return {
    programId: PROGRAM,
    accounts: [
      { address: PAYER, signer: true, writable: true },
      { address: PROGRAM, signer: false, writable: true },
    ],
    data: encodeDeposit(1_000_000n),
  };
}

describe("transaction assembly", () => {
  it("resolves instructions into web3 instructions", () => {
    const instructions = toTransactionInstructions([depositInstruction()]);
    expect(instructions).toHaveLength(1);
    expect(instructions[0]!.programId.toBase58()).toBe(PROGRAM);
    expect(instructions[0]!.keys[0]).toMatchObject({ isSigner: true, isWritable: true });
    expect(instructions[0]!.data.equals(Buffer.from(encodeDeposit(1_000_000n)))).toBe(true);
  });

  it("builds an unsigned transaction with the payer and blockhash", () => {
    const transaction = buildTransaction({
      instructions: [depositInstruction()],
      feePayer: PAYER,
      recentBlockhash: BLOCKHASH,
    });
    expect(transaction.message.recentBlockhash).toBe(BLOCKHASH);
    expect(transaction.message.staticAccountKeys[0]!.toBase58()).toBe(PAYER);
    // No signatures yet: it is unsigned.
    expect(transaction.signatures.every((signature) => signature.every((byte) => byte === 0))).toBe(true);
  });

  it("survives a serialization round-trip with the same program and data", () => {
    const transaction = buildTransaction({
      instructions: [depositInstruction()],
      feePayer: PAYER,
      recentBlockhash: BLOCKHASH,
    });
    const decoded = VersionedTransaction.deserialize(transaction.serialize());
    const compiled = decoded.message.compiledInstructions[0]!;
    expect(decoded.message.staticAccountKeys[compiled.programIdIndex]!.toBase58()).toBe(PROGRAM);
    expect(Buffer.from(compiled.data).equals(Buffer.from(encodeDeposit(1_000_000n)))).toBe(true);
  });

  it("assembles a prepared transaction with a complete preview", () => {
    const { prepared } = assembleTransaction({
      instructions: [depositInstruction()],
      preview: {
        action: "billing.deposit",
        cluster: "devnet",
        programId: PROGRAM,
        feePayer: PAYER,
        amount: { minor: "1000000", decimals: 6, asset: "USDC" },
        subject: PROGRAM,
        policyNote: "Deposits USDC into your billing vault.",
      },
      feePayer: PAYER,
      recentBlockhash: BLOCKHASH,
      lastValidBlockHeight: 123,
    });
    expect(prepared.cluster).toBe("devnet");
    expect(prepared.recentBlockhash).toBe(BLOCKHASH);
    expect(prepared.lastValidBlockHeight).toBe(123);
    expect(prepared.preview.amountMinor).toBe(1_000_000n);
    expect(prepared.preview.asset).toBe("USDC");
    expect(prepared.preview.instructions[0]!.programId).toBe(PROGRAM);
    // The base64 message decodes back to the same transaction.
    expect(() => VersionedTransaction.deserialize(Buffer.from(prepared.messageBase64, "base64"))).not.toThrow();
  });
});
