/**
 * A minimal, framework-free description of how a customer exits a contract
 * without the hosted frontend. The plan requires that access to funds never
 * depend on the app being up: a customer can always withdraw a billing balance
 * or run a treasury exit from a small script and their own wallet.
 *
 * This module is the pure core of that fallback: it derives the PDAs and names
 * the exact instruction and accounts a client must build. It holds no key and
 * sends nothing — a CLI wraps it with a wallet and an RPC.
 */
import {
  findProgramAddress,
  seedBillingVault,
  seedBillingVaultToken,
  seedMandate,
  seedTreasuryAuthority,
  seedTreasuryConfig,
  seedTreasuryToken,
} from "./pda";

export interface ExitStep {
  /** The instruction name to call, e.g. "withdraw". */
  instruction: string;
  /** The program that must be called. */
  programId: string;
  /** Named accounts the instruction needs, in order, with resolved addresses. */
  accounts: { name: string; address: string }[];
  /** A one-line description of what this step does. */
  description: string;
}

export interface BillingExitInput {
  programId: string;
  merchant: string;
  controller: string;
}

export interface TreasuryExitInput {
  programId: string;
  entity: string;
}

/** The billing withdrawal path: revoke renewal, then withdraw the balance. */
export async function billingExitSteps(input: BillingExitInput): Promise<ExitStep[]> {
  const { address: vault } = await findProgramAddress(seedBillingVault(input.merchant, input.controller), input.programId);
  const { address: vaultAuthority } = await findProgramAddress(
    seedBillingVault(input.merchant, input.controller),
    input.programId,
  );
  const { address: vaultToken } = await findProgramAddress(seedBillingVaultToken(vault), input.programId);
  const { address: mandate } = await findProgramAddress(seedMandate(vault), input.programId);

  return [
    {
      instruction: "revoke_mandate",
      programId: input.programId,
      description: "Stop future renewals. Paid access continues to its recorded end. No merchant signature.",
      accounts: [
        { name: "controller", address: input.controller },
        { name: "vault", address: vault },
        { name: "mandate", address: mandate },
      ],
    },
    {
      instruction: "withdraw",
      programId: input.programId,
      description: "Move the unspent balance to the controller's own USDC account. No merchant signature.",
      accounts: [
        { name: "controller", address: input.controller },
        { name: "vault", address: vault },
        { name: "vault_authority", address: vaultAuthority },
        { name: "vault_token", address: vaultToken },
        { name: "destination_token", address: "<the controller's USDC token account>" },
      ],
    },
  ];
}

/** The treasury emergency-exit path, usable while execution is paused. */
export async function treasuryExitSteps(input: TreasuryExitInput): Promise<ExitStep[]> {
  const { address: treasury } = await findProgramAddress(seedTreasuryConfig(input.entity), input.programId);
  const { address: treasuryAuthority } = await findProgramAddress(seedTreasuryAuthority(treasury), input.programId);
  const { address: treasuryToken } = await findProgramAddress(seedTreasuryToken(treasury), input.programId);

  return [
    {
      instruction: "execute_emergency_exit",
      programId: input.programId,
      description:
        "A quorum sends the treasury balance to the registered recovery wallet. Works while paused; needs no app.",
      accounts: [
        { name: "actor", address: "<a treasury approver>" },
        { name: "treasury", address: treasury },
        { name: "governance", address: "<the emergency-exit governance proposal>" },
        { name: "treasury_authority", address: treasuryAuthority },
        { name: "treasury_token", address: treasuryToken },
        { name: "recovery_token", address: "<the recovery wallet's USDC token account>" },
      ],
    },
  ];
}
