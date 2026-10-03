/**
 * Server-side Solana deployment configuration for the Token Ledger contracts.
 *
 * The app resolves the cluster, program IDs, mint and token program from this
 * module — never from user input. A request carries no program address. This is
 * the one place the contract addresses are read, so an untrusted caller cannot
 * point the executor at a different program or mint.
 *
 * Unset means the contract features are off: callers must check
 * `solanaConfig()` for null rather than assume a deployment exists. See
 * docs/adr-solana-contracts.md and contracts/DEPLOYMENTS.md.
 */
import { isValidSolanaAddress } from "@/adapters/sources/solana/address";

/** The legacy SPL Token program. Version one accepts only this. */
export const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** USDC has 6 decimals on Solana. The programs verify this at initialization. */
export const USDC_DECIMALS = 6;

export type SolanaCluster = "devnet" | "mainnet-beta" | "localnet";

export interface SolanaDeployment {
  cluster: SolanaCluster;
  /** The read/submit RPC endpoint. */
  rpcUrl: string;
  /** The `service_balance` program (billing). */
  serviceBalanceProgram: string;
  /** The `treasury_payables` program (accounts payable). */
  treasuryPayablesProgram: string;
  /** The one configured USDC mint this deployment accepts. */
  usdcMint: string;
  /** The SPL token program; legacy only in version one. */
  tokenProgram: string;
}

export interface SolanaContractEnv {
  SOLANA_CONTRACTS_CLUSTER?: string;
  SOLANA_RPC_URL?: string;
  SERVICE_BALANCE_PROGRAM_ID?: string;
  TREASURY_PAYABLES_PROGRAM_ID?: string;
  USDC_MINT?: string;
  SPL_TOKEN_PROGRAM_ID?: string;
}

const CLUSTERS: readonly SolanaCluster[] = ["devnet", "mainnet-beta", "localnet"];

/**
 * Read the deployment from the environment. Returns null when no cluster is
 * configured (the contract features are off). Throws when a value is present
 * but malformed, so a mistyped address fails at startup rather than at signing.
 */
export function solanaDeployment(env: SolanaContractEnv = process.env as SolanaContractEnv): SolanaDeployment | null {
  const cluster = env.SOLANA_CONTRACTS_CLUSTER?.trim();
  if (!cluster) return null;
  if (!CLUSTERS.includes(cluster as SolanaCluster)) {
    throw new Error(`SOLANA_CONTRACTS_CLUSTER must be one of ${CLUSTERS.join(", ")}.`);
  }

  const serviceBalance = requireAddress(env.SERVICE_BALANCE_PROGRAM_ID, "SERVICE_BALANCE_PROGRAM_ID");
  const treasuryPayables = requireAddress(env.TREASURY_PAYABLES_PROGRAM_ID, "TREASURY_PAYABLES_PROGRAM_ID");
  const usdcMint = requireAddress(env.USDC_MINT, "USDC_MINT");
  const tokenProgram = env.SPL_TOKEN_PROGRAM_ID?.trim() || SPL_TOKEN_PROGRAM;
  if (!isValidSolanaAddress(tokenProgram)) {
    throw new Error("SPL_TOKEN_PROGRAM_ID is not a valid Solana address.");
  }
  const rpcUrl = readRpcUrl(env.SOLANA_RPC_URL, cluster as SolanaCluster);

  return {
    cluster: cluster as SolanaCluster,
    rpcUrl,
    serviceBalanceProgram: serviceBalance,
    treasuryPayablesProgram: treasuryPayables,
    usdcMint,
    tokenProgram,
  };
}

function requireAddress(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required when SOLANA_CONTRACTS_CLUSTER is set.`);
  if (!isValidSolanaAddress(trimmed)) throw new Error(`${name} is not a valid Solana address.`);
  return trimmed;
}

/** The default public endpoints, used when no private RPC is configured. */
const PUBLIC_RPC: Record<SolanaCluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

function readRpcUrl(value: string | undefined, cluster: SolanaCluster): string {
  const trimmed = value?.trim();
  if (!trimmed) return PUBLIC_RPC[cluster];
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("SOLANA_RPC_URL must be a valid URL.");
  }
  if (cluster === "localnet" ? url.protocol !== "http:" && url.protocol !== "https:" : url.protocol !== "https:") {
    throw new Error("SOLANA_RPC_URL must be https:// (http:// is allowed only for localnet).");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("SOLANA_RPC_URL must not embed credentials in the URL.");
  }
  return trimmed;
}

/** Whether the contract features are configured. Safe to call with no database. */
export function contractsConfigured(env: SolanaContractEnv = process.env as SolanaContractEnv): boolean {
  try {
    return solanaDeployment(env) !== null;
  } catch {
    // A misconfigured deployment is not "configured"; the throw is surfaced when
    // the deployment is actually read.
    return env.SOLANA_CONTRACTS_CLUSTER?.trim() ? true : false;
  }
}
