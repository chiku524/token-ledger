import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatusBadge } from "@/components/app/status-badge";
import { NumberCell } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { BillingAction } from "@/components/billing-controls";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { loadBilling } from "@/data/load-billing";
import { entityName } from "@/data/present";
import { formatMinor } from "@/ledger";
import { USDC_DECIMALS } from "@/config/solana";

export const metadata = { title: "Billing" };

function usdc(amountMinor: bigint): string {
  return `USDC ${formatMinor(amountMinor, USDC_DECIMALS, { minFraction: 2, maxFraction: 2 })}`;
}

function periods(seconds: number): string {
  const days = Math.round(seconds / 86_400);
  return days === 30 ? "30 days" : `${days} days`;
}

export default async function BillingPage() {
  const { session, configured, deployment, actionable, entities, bindings, vaults, merchant } = await loadBilling();
  const csrf = await ensureCsrf();

  return (
    <>
      <PageHeader
        kicker="Service Balance"
        title="Billing"
        description="Fund a USDC vault and authorize bounded, recurring 30-day charges. You can cancel renewal and withdraw unspent funds at any time — no merchant signature. Merely connecting a read-only wallet never enables spending."
      />

      {!configured ? (
        <Alert variant="warning" className="mb-6 max-w-2xl">
          The contract features are not configured on this deployment. Set the Solana cluster and program ids to enable
          billing. Nothing here can move funds until then.
        </Alert>
      ) : null}
      {configured && session.demo ? (
        <Alert variant="warning" className="mb-6 max-w-2xl">
          This is a demo. Contract transactions are prepared but not signed or sent here.
        </Alert>
      ) : null}

      <SectionHeader
        title="Your wallet"
        description={
          <>
            Billing is controlled by a Solana wallet you bind to a company in{" "}
            <Link href="/dashboard/settings" className="text-link underline">
              Settings
            </Link>
            . The app never holds your key; it only prepares a transaction your wallet signs.
          </>
        }
      />
      {bindings.length === 0 ? (
        <EmptyState className="mt-4">No wallet is bound to a company yet.</EmptyState>
      ) : (
        <TableCard>
          <Table>
            <caption className="sr-only">Bound wallets</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map((binding) => (
                <TableRow key={binding.id}>
                  <TableCell>{entityName(binding.entityId, entities)}</TableCell>
                  <NumberCell align="left" className="break-all">
                    {binding.walletAddress}
                  </NumberCell>
                  <TableCell>{binding.cluster}</TableCell>
                  <TableCell>
                    <StatusBadge tone="success">Verified</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {actionable && configured && deployment ? (
        merchant ? (
          <section className="mt-10">
            <SectionHeader
              title="Merchant plan"
              description={
                <>
                  Publish an immutable plan version: a fixed price per 30-day period. Existing mandates are unaffected.
                  Signed by the merchant admin wallet{" "}
                  <span className="font-mono text-xs">{merchant.adminAddress}</span>. Destination{" "}
                  <span className="font-mono text-xs">{merchant.destination}</span>.
                </>
              }
            />
            <div className="mt-4 max-w-2xl">
              <BillingAction
                action="create_plan"
                csrf={csrf}
                entityId={entities[0]?.id ?? ""}
                cluster={deployment.cluster}
                rpcUrl={deployment.rpcUrl}
                wallet={merchant.adminAddress}
                description="Only the merchant admin can publish a plan."
              />
            </div>
          </section>
        ) : (
          <section className="mt-10">
            <SectionHeader
              title="Initialize merchant"
              description="Create the merchant config with a connected wallet. That wallet becomes the merchant admin and can publish plans; it can never touch customer funds. This runs once per deployment."
            />
            <div className="mt-4 max-w-2xl">
              <BillingAction
                action="initialize_merchant"
                csrf={csrf}
                entityId={entities[0]?.id ?? ""}
                cluster={deployment.cluster}
                rpcUrl={deployment.rpcUrl}
                wallet=""
              />
            </div>
          </section>
        )
      ) : null}

      <section className="mt-10">
        <SectionHeader
          title="Vaults and mandates"
          description="A vault holds your USDC. A mandate authorizes a bounded, recurring charge and records what has been paid. Cancel renewal and withdraw are always available without the merchant."
        />
        {vaults.length === 0 ? (
          <div className="mt-4 grid max-w-2xl gap-3">
            <p className="text-sm text-muted-foreground">No billing vault yet. Create one, then deposit to fund it.</p>
            {actionable && entities[0] ? (
              <BillingAction
                action="create_vault"
                csrf={csrf}
                entityId={entities[0].id}
                cluster={deployment!.cluster}
                rpcUrl={deployment!.rpcUrl}
                wallet=""
              />
            ) : null}
          </div>
        ) : (
          vaults.map((vault) => (
            <div key={vault.id} className="mt-6 grid gap-4 xl:grid-cols-2">
              <TableCard className="mt-0">
                <Table>
                  <caption className="sr-only">Vault {vault.vaultAddress}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vault</TableHead>
                      <TableHead>Controller</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <NumberCell align="left" className="break-all">
                        {vault.vaultAddress}
                      </NumberCell>
                      <NumberCell align="left" className="break-all">
                        {vault.controllerAddress}
                      </NumberCell>
                      <TableCell>
                        <StatusBadge tone={vault.finalization === "finalized" ? "success" : "neutral"}>
                          {vault.finalization}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableCard>

              {vault.mandate ? (
                <div className="grid gap-3 text-sm">
                  <p>
                    Price <strong>{usdc(vault.mandate.priceMinor)}</strong> per {periods(vault.mandate.periodSeconds)} ·
                    cap {usdc(vault.mandate.maxTotalDebitMinor)} · debited {usdc(vault.mandate.totalDebitedMinor)}
                  </p>
                  <p className="text-muted-foreground">
                    Access paid through {vault.mandate.paidThrough.toISOString().slice(0, 10)}
                    {vault.entitlement
                      ? vault.entitlement.renewing
                        ? " · renewal active"
                        : ` · not renewing (${vault.entitlement.reason})`
                      : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No mandate signed for this vault yet.</p>
              )}

              {vault.charges.length > 0 ? (
                <div className="xl:col-span-2">
                  <TableCard className="mt-0">
                    <Table>
                      <caption className="sr-only">Receipts for {vault.vaultAddress}</caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cycle</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Coverage</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vault.charges.map((charge) => (
                          <TableRow key={charge.id}>
                            <NumberCell align="left">{charge.cycle.toString()}</NumberCell>
                            <NumberCell>{usdc(charge.amountMinor)}</NumberCell>
                            <NumberCell align="left">
                              {charge.coverageStart.toISOString().slice(0, 10)} – {charge.coverageEnd.toISOString().slice(0, 10)}
                            </NumberCell>
                            <NumberCell align="left" className="break-all">
                              {charge.receiptAddress}
                            </NumberCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableCard>
                </div>
              ) : null}

              {actionable ? (
                <div className="grid gap-3 xl:col-span-2 xl:grid-cols-3">
                  <BillingAction
                    action="deposit"
                    csrf={csrf}
                    entityId={vault.entityId}
                    vaultId={vault.id}
                    cluster={deployment!.cluster}
                    rpcUrl={deployment!.rpcUrl}
                    wallet={vault.controllerAddress}
                  />
                  <BillingAction
                    action="revoke"
                    csrf={csrf}
                    entityId={vault.entityId}
                    vaultId={vault.id}
                    cluster={deployment!.cluster}
                    rpcUrl={deployment!.rpcUrl}
                    wallet={vault.controllerAddress}
                    label="Cancel renewal"
                    description="Stops future charges. Paid access continues to its recorded end."
                  />
                  <BillingAction
                    action="withdraw"
                    csrf={csrf}
                    entityId={vault.entityId}
                    vaultId={vault.id}
                    cluster={deployment!.cluster}
                    rpcUrl={deployment!.rpcUrl}
                    wallet={vault.controllerAddress}
                    label="Withdraw balance"
                    description="Moves unspent balance to your own USDC account. No merchant signature."
                  />
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>
    </>
  );
}
