import { cache } from "react";
import type { SessionUser } from "@/auth/current";
import { getSession } from "@/auth/current";
import { can } from "@/auth/roles";
import type { SolanaDeployment } from "@/config/solana";
import { solanaDeployment } from "@/config/solana";
import { deriveEntitlement, type Entitlement } from "@/billing/entitlement";
import { listChargesForMandate, listBillingVaults, mandateViewForVault, type ChargeView, type MandateView } from "@/db/billing";
import { findMerchantForCluster, type MerchantView } from "@/db/merchant";
import { listActiveWalletBindings, type WalletBindingView } from "@/db/wallet-bindings";
import { hasDatabase } from "@/db/availability";
import { loadAuthorizedBooks } from "./authorized-books";
import type { BooksEntity } from "./books";

export interface BillingVaultRow {
  id: string;
  entityId: string;
  vaultAddress: string;
  controllerAddress: string;
  finalization: "pending" | "finalized" | "failed";
  mandate: MandateView | null;
  entitlement: Entitlement | null;
  charges: ChargeView[];
}

export interface BillingData {
  session: SessionUser;
  /** Whether the contract features are configured on this deployment. */
  configured: boolean;
  deployment: SolanaDeployment | null;
  /** Whether the user may act: contracts on, database on, not demo, has permission. */
  actionable: boolean;
  entities: readonly BooksEntity[];
  bindings: WalletBindingView[];
  vaults: BillingVaultRow[];
  /** The merchant config initialized from the app, if any. */
  merchant: MerchantView | null;
}

/**
 * The Billing page's data. With no database or no configured deployment, it
 * reports that the contract features are off rather than guessing. Wallet
 * bindings are the customer wallets that may control a vault.
 */
export const loadBilling = cache(async (): Promise<BillingData> => {
  const { session, books } = await loadAuthorizedBooks();
  let deployment: SolanaDeployment | null = null;
  let configured = false;
  try {
    deployment = solanaDeployment();
    configured = deployment !== null;
  } catch {
    // A misconfigured deployment is reported as not configured here; reading it
    // directly is what surfaces the error, and the page does not need to crash.
    configured = false;
  }

  const writable = hasDatabase() && !session.demo;
  const actionable = configured && writable && can(session.role, "source.connect");

  if (!writable) {
    return { session, configured, deployment, actionable, entities: books.entities, bindings: [], vaults: [], merchant: null };
  }

  const organizationId = session.organizationId as string;
  const [bindings, vaultRows, merchant] = await Promise.all([
    listActiveWalletBindings(organizationId),
    listBillingVaults(organizationId),
    // A local run may not have migrated `merchant_configs`; a missing table means
    // "not initialized", not a crash.
    deployment
      ? findMerchantForCluster(organizationId, deployment.cluster).catch(() => null)
      : Promise.resolve(null),
  ]);

  const now = new Date();
  const vaults: BillingVaultRow[] = [];
  for (const vault of vaultRows) {
    const mandate = await mandateViewForVault(vault.id);
    const charges = mandate ? await listChargesForMandate(mandate.id) : [];
    vaults.push({
      ...vault,
      mandate,
      entitlement: mandate ? deriveEntitlement(toMandateState(mandate), now) : null,
      charges,
    });
  }

  return { session, configured, deployment, actionable, entities: books.entities, bindings, vaults, merchant };
});

function toMandateState(mandate: MandateView) {
  return {
    finalization: mandate.finalization,
    revoked: mandate.revoked,
    authorizationExpiry: mandate.authorizationExpiry,
    paidThrough: mandate.paidThrough,
    totalDebitedMinor: mandate.totalDebitedMinor,
    maxTotalDebitMinor: mandate.maxTotalDebitMinor,
    generation: mandate.generation,
  };
}

/** Re-exported so the page does not import the entitlement module directly. */
export { getSession };
