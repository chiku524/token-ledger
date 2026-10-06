/**
 * A wire-safe form of a plan. The server prepares instructions that contain a
 * `Uint8Array` of instruction data; a server action must return something plain,
 * so the data is base64-encoded here and decoded on the client before assembly.
 */
import type { PlannedInstruction } from "@/billing/service";
import type { TransactionPreview } from "@/contracts/preview";
import { fromBase64, toBase64 } from "@/lib/webcrypto";

export interface SerializableInstruction {
  programId: string;
  accounts: { address: string; signer: boolean; writable: boolean }[];
  dataBase64: string;
}

export interface SerializablePlan {
  action: TransactionPreview["action"];
  cluster: string;
  feePayer: string;
  preview: TransactionPreview;
  instructions: SerializableInstruction[];
}

export function serializePlan(input: {
  instructions: readonly PlannedInstruction[];
  preview: TransactionPreview;
  feePayer: string;
}): SerializablePlan {
  return {
    action: input.preview.action,
    cluster: input.preview.cluster,
    feePayer: input.feePayer,
    preview: input.preview,
    instructions: input.instructions.map((instruction) => ({
      programId: instruction.programId,
      accounts: instruction.accounts.map((account) => ({ ...account })),
      dataBase64: toBase64(instruction.data),
    })),
  };
}

export function deserializeInstruction(instruction: SerializableInstruction): PlannedInstruction {
  return {
    programId: instruction.programId,
    accounts: instruction.accounts.map((account) => ({ ...account })),
    data: fromBase64(instruction.dataBase64),
  };
}

export function deserializePlan(plan: SerializablePlan): PlannedInstruction[] {
  return plan.instructions.map(deserializeInstruction);
}
