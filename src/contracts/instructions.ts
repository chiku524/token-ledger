/**
 * Anchor instruction encoding for the Token Ledger contracts. The 8-byte
 * discriminator is the first 8 bytes of `sha256("global:<name>")`; the IDL pins
 * the exact bytes, and tests assert every encoder against them, so a rename in
 * the program cannot silently change what the app sends.
 *
 * Argument encoding follows Anchor's Borsh layout: fixed-size integers are
 * little-endian; `Pubkey` is 32 raw bytes; `[u8; N]` is N raw bytes; a `Vec<T>`
 * is a 4-byte little-endian length followed by the elements.
 */
import { toBase64 } from "@/lib/webcrypto";
import { pubkeySeed } from "./pda";

/** The 8-byte discriminators, pinned to `contracts/idl/service_balance.json`. */
export const SERVICE_BALANCE_DISCRIMINATORS = {
  initialize_merchant: [7, 90, 74, 38, 99, 111, 142, 77],
  set_collection_pause: [68, 115, 6, 8, 223, 24, 76, 37],
  rotate_collector: [242, 186, 190, 160, 86, 171, 219, 191],
  create_plan_version: [35, 119, 73, 125, 33, 216, 110, 111],
  create_billing_vault: [5, 124, 128, 23, 2, 251, 207, 30],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  activate_mandate_and_charge: [27, 158, 211, 164, 80, 23, 133, 215],
  collect_cycle: [133, 120, 131, 109, 113, 161, 86, 172],
  revoke_mandate: [252, 97, 140, 119, 67, 43, 177, 108],
  replace_mandate: [68, 86, 19, 108, 67, 139, 30, 30],
} as const satisfies Record<string, readonly number[]>;

/** A 32-byte public key as raw bytes. */
export function pubkeyBytes(address: string): Uint8Array {
  return pubkeySeed(address);
}

function u8(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff);
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = value & 0xff;
  out[1] = (value >> 8) & 0xff;
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  let rest = value;
  for (let index = 0; index < 4; index += 1) {
    out[index] = rest & 0xff;
    rest >>>= 8;
  }
  return out;
}

function u64(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("A u64 argument cannot be negative.");
  const out = new Uint8Array(8);
  let rest = value;
  for (let index = 0; index < 8; index += 1) {
    out[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function i64(value: bigint): Uint8Array {
  // Two's complement, little-endian.
  const out = new Uint8Array(8);
  let rest = value < 0n ? value + 0x1_0000_0000_0000_0000n : value;
  for (let index = 0; index < 8; index += 1) {
    out[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function encodeInitializeMerchant(args: {
  mint: string;
  tokenProgram: string;
  destination: string;
}): Uint8Array {
  return concat([
    Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.initialize_merchant),
    pubkeyBytes(args.mint),
    pubkeyBytes(args.tokenProgram),
    pubkeyBytes(args.destination),
  ]);
}

export function encodeSetCollectionPause(paused: boolean): Uint8Array {
  return concat([Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.set_collection_pause), u8(paused ? 1 : 0)]);
}

export function encodeRotateCollector(collector: string): Uint8Array {
  return concat([Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.rotate_collector), pubkeyBytes(collector)]);
}

export function encodeCreatePlanVersion(args: {
  planId: Uint8Array;
  version: number;
  price: bigint;
  maxPeriods: number;
}): Uint8Array {
  if (args.planId.length !== 16) throw new Error("A plan id is 16 bytes.");
  return concat([
    Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.create_plan_version),
    args.planId,
    u16(args.version),
    u64(args.price),
    u32(args.maxPeriods),
  ]);
}

export function encodeCreateBillingVault(controller: string): Uint8Array {
  return concat([Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.create_billing_vault), pubkeyBytes(controller)]);
}

export function encodeDeposit(amount: bigint): Uint8Array {
  return concat([Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.deposit), u64(amount)]);
}

export function encodeWithdraw(amount: bigint): Uint8Array {
  return concat([Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.withdraw), u64(amount)]);
}

export function encodeActivateMandate(args: {
  maxTotalDebit: bigint;
  authorizationExpiry: bigint;
}): Uint8Array {
  return concat([
    Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.activate_mandate_and_charge),
    u64(args.maxTotalDebit),
    i64(args.authorizationExpiry),
  ]);
}

export function encodeCollectCycle(cycle: bigint): Uint8Array {
  return concat([Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.collect_cycle), u64(cycle)]);
}

export function encodeRevokeMandate(): Uint8Array {
  return Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.revoke_mandate);
}

export function encodeReplaceMandate(args: {
  maxTotalDebit: bigint;
  authorizationExpiry: bigint;
}): Uint8Array {
  return concat([
    Uint8Array.from(SERVICE_BALANCE_DISCRIMINATORS.replace_mandate),
    u64(args.maxTotalDebit),
    i64(args.authorizationExpiry),
  ]);
}

/** Base64 of an instruction's data, for a wire transaction. */
export function dataBase64(data: Uint8Array): string {
  return toBase64(data);
}

/** The 8-byte discriminators, pinned to `contracts/idl/treasury_payables.json`. */
export const TREASURY_PAYABLES_DISCRIMINATORS = {
  initialize_treasury: [124, 186, 211, 195, 85, 165, 129, 166],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  propose_payment: [102, 219, 97, 51, 201, 219, 247, 27],
  approve_payment: [21, 123, 195, 139, 107, 141, 34, 187],
  revoke_approval: [44, 51, 184, 108, 182, 202, 20, 53],
  cancel_payment: [217, 129, 71, 37, 216, 193, 38, 33],
  execute_payment: [86, 4, 7, 7, 120, 139, 232, 139],
  pause_execution: [254, 15, 49, 32, 131, 119, 85, 196],
  propose_governance: [129, 138, 213, 117, 56, 242, 208, 54],
  approve_governance: [90, 116, 1, 180, 176, 79, 244, 224],
  execute_policy_change: [127, 42, 199, 98, 79, 199, 181, 102],
  execute_emergency_exit: [100, 185, 247, 167, 47, 188, 16, 11],
} as const satisfies Record<string, readonly number[]>;

/** GovernanceKind variant order, matching the IDL enum. */
export const GOVERNANCE_KINDS = ["PolicyChange", "Unpause", "EmergencyExit"] as const;
export type GovernanceKind = (typeof GOVERNANCE_KINDS)[number];

/** The maximum approver set the programs accept; an array argument is padded to it. */
export const MAX_APPROVERS = 10;

function vecPubkeys(addresses: string[]): Uint8Array {
  return concat([u32(addresses.length), ...addresses.map(pubkeyBytes)]);
}

function fixedPubkeys10(addresses: string[]): Uint8Array {
  if (addresses.length > MAX_APPROVERS) throw new Error(`At most ${MAX_APPROVERS} approvers.`);
  const padded = [...addresses];
  while (padded.length < MAX_APPROVERS) padded.push("11111111111111111111111111111111");
  return concat(padded.map(pubkeyBytes));
}

export function encodeInitializeTreasury(args: {
  entity: string;
  mint: string;
  tokenProgram: string;
  threshold: number;
  approvers: string[];
  proposers: string[];
  perPaymentLimit: bigint;
  dailyLimit: bigint;
  maxProposalLifetime: bigint;
  recovery: string;
}): Uint8Array {
  return concat([
    Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.initialize_treasury),
    pubkeyBytes(args.entity),
    pubkeyBytes(args.mint),
    pubkeyBytes(args.tokenProgram),
    u8(args.threshold),
    vecPubkeys(args.approvers),
    vecPubkeys(args.proposers),
    u64(args.perPaymentLimit),
    u64(args.dailyLimit),
    i64(args.maxProposalLifetime),
    pubkeyBytes(args.recovery),
  ]);
}

export function encodeTreasuryDeposit(amount: bigint): Uint8Array {
  return concat([Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.deposit), u64(amount)]);
}

export function encodeProposePayment(args: {
  invoiceKey: Uint8Array;
  revision: number;
  recipientOwner: string;
  grossAmount: bigint;
}): Uint8Array {
  if (args.invoiceKey.length !== 32) throw new Error("An invoice key is 32 bytes.");
  return concat([
    Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.propose_payment),
    args.invoiceKey,
    u32(args.revision),
    pubkeyBytes(args.recipientOwner),
    u64(args.grossAmount),
  ]);
}

export function encodeApprovePayment(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.approve_payment);
}

export function encodeRevokeApproval(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.revoke_approval);
}

export function encodeCancelPayment(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.cancel_payment);
}

export function encodeExecutePayment(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.execute_payment);
}

export function encodePauseExecution(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.pause_execution);
}

export function encodeProposeGovernance(args: {
  kind: GovernanceKind;
  newThreshold: number;
  newApproverCount: number;
  newApprovers: string[];
  newPerPaymentLimit: bigint;
  newDailyLimit: bigint;
  newRecovery: string;
}): Uint8Array {
  const kindIndex = GOVERNANCE_KINDS.indexOf(args.kind);
  if (kindIndex < 0) throw new Error(`Unknown governance kind ${args.kind}.`);
  return concat([
    Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.propose_governance),
    u8(kindIndex),
    u8(args.newThreshold),
    u8(args.newApproverCount),
    fixedPubkeys10(args.newApprovers),
    u64(args.newPerPaymentLimit),
    u64(args.newDailyLimit),
    pubkeyBytes(args.newRecovery),
  ]);
}

export function encodeApproveGovernance(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.approve_governance);
}

export function encodeExecutePolicyChange(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.execute_policy_change);
}

export function encodeExecuteEmergencyExit(): Uint8Array {
  return Uint8Array.from(TREASURY_PAYABLES_DISCRIMINATORS.execute_emergency_exit);
}
