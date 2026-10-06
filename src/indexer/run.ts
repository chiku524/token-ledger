/**
 * The indexer's per-deployment entrypoint: run one pass for each program
 * (billing, treasury) against the configured RPC, then project the entitlements
 * whose mandates just advanced. Called by the indexer cron with a bearer secret.
 *
 * It never trusts anything above finality (the pass enforces that) and it is
 * idempotent, so a restart or a redelivery is safe. With no deployment it is a
 * no-op that says why.
 */
import { RpcSolanaTransport } from "@/adapters/execution/solana/rpc-transport";
import { solanaDeployment } from "@/config/solana";
import { hasDatabase } from "@/db/availability";
import { getDb } from "@/db/client";
import { billingVaults, mandates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { databaseIndexerStore } from "./store";
import { rpcChainSource } from "./rpc-source";
import { runIndexerPass, type IndexerPassSummary } from "./pass";
import { projectEntitlementForVault } from "@/db/entitlements";

export interface IndexerRunSummary {
  programs: Array<{ programId: string; summary: IndexerPassSummary }>;
  entitlementsProjected: number;
}

/**
 * Run one indexer pass per configured program, then project entitlements for
 * every finalized mandate. Exported (not route-only) so a scheduler or a test can
 * drive it directly.
 */
export async function runIndexerPasses(): Promise<IndexerRunSummary | null> {
  if (!hasDatabase()) return null;
  const deployment = solanaDeployment();
  if (!deployment) return null;

  const rpc = new RpcSolanaTransport({ url: deployment.rpcUrl, cluster: deployment.cluster });
  const source = rpcChainSource(rpc);
  const store = databaseIndexerStore();

  const programs = [deployment.serviceBalanceProgram, deployment.treasuryPayablesProgram];
  const summaries: IndexerRunSummary["programs"] = [];
  for (const programId of programs) {
    const summary = await runIndexerPass({ source, store }, { cluster: deployment.cluster, programId });
    summaries.push({ programId, summary });
  }

  const entitlementsProjected = await projectFinalizedEntitlements();
  return { programs: summaries, entitlementsProjected };
}

/**
 * Project the entitlement for every finalized mandate. Idempotent per mandate and
 * generation, so running it each pass is safe and cheap.
 */
async function projectFinalizedEntitlements(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      organizationId: mandates.organizationId,
      entityId: mandates.entityId,
      billingVaultId: mandates.billingVaultId,
    })
    .from(mandates)
    .where(eq(mandates.finalization, "finalized"));
  let projected = 0;
  for (const row of rows) {
    await projectEntitlementForVault(row.organizationId, row.entityId, row.billingVaultId, now);
    projected += 1;
  }
  return projected;
}

/** Kept for a future per-vault projection trigger; unused today. */
export async function billingVaultIdsForOrganization(organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ id: billingVaults.id }).from(billingVaults).where(eq(billingVaults.organizationId, organizationId));
  return rows.map((row) => row.id);
}
