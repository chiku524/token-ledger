import { ensureCsrf } from "@/auth/current";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatusBadge } from "@/components/app/status-badge";
import { TableCard } from "@/components/app/table-card";
import { NumberCell } from "@/components/app/table-cells";
import { Field } from "@/components/app/field";
import { RecordForm, TreasuryAction } from "@/components/treasury-controls";
import {
  createInvoiceAction,
  prepareApprovePayment,
  prepareCancelPayment,
  prepareExecutePayment,
  prepareProposePayment,
  prepareRevokeApproval,
} from "@/app/dashboard/treasury-actions";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { loadTreasury } from "@/data/load-treasury";
import { entityName } from "@/data/present";
import { formatMinor } from "@/ledger";
import { USDC_DECIMALS } from "@/config/solana";

export const metadata = { title: "Payables" };

function usdc(amountMinor: bigint): string {
  return `USDC ${formatMinor(amountMinor, USDC_DECIMALS, { minFraction: 2, maxFraction: 2 })}`;
}

function proposalStatus(proposal: { executed: boolean; cancelled: boolean; expiresAt: Date }): { label: string; tone: "success" | "danger" | "neutral" | "warning" } {
  if (proposal.executed) return { label: "Paid", tone: "success" };
  if (proposal.cancelled) return { label: "Cancelled", tone: "neutral" };
  if (proposal.expiresAt.getTime() < Date.now()) return { label: "Expired", tone: "warning" };
  return { label: "Awaiting approval", tone: "neutral" };
}

export default async function PayablesPage() {
  const { configured, deployment, actionable, entities, treasuries, suppliers, invoices, proposals } = await loadTreasury();
  const csrf = await ensureCsrf();
  const supplierName = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? id;
  const defaultTreasury = treasuries[0]?.id ?? "";

  return (
    <>
      <PageHeader
        kicker="Accounts Payable"
        title="Payables"
        description="Record a supplier invoice privately, propose a payment against a treasury, collect wallet approvals and execute. 'Paid' requires a finalized on-chain settlement. Names and documents stay off-chain."
      />

      {!configured ? (
        <Alert variant="warning" className="mb-6 max-w-2xl">
          The contract features are not configured on this deployment. Invoices can be recorded, but payment proposals and
          execution are disabled.
        </Alert>
      ) : null}

      <section>
        <SectionHeader
          title="Invoices"
          description="Private records. The on-chain proposal references an invoice only by its opaque key; a duplicate supplier reference is refused before any proposal."
        />
        {invoices.length === 0 ? (
          <EmptyState className="mt-4">No invoices yet.</EmptyState>
        ) : (
          <TableCard>
            <Table>
              <caption className="sr-only">Invoices</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {actionable ? <TableHead>Propose</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{entityName(invoice.entityId, entities)}</TableCell>
                    <TableCell>{supplierName(invoice.supplierId)}</TableCell>
                    <TableCell>{invoice.supplierReference}</TableCell>
                    <NumberCell>{usdc(invoice.amountMinor)}</NumberCell>
                    <TableCell>
                      <StatusBadge tone="neutral" className="capitalize">
                        {invoice.status}
                      </StatusBadge>
                    </TableCell>
                    {actionable && defaultTreasury ? (
                      <TableCell>
                        <TreasuryAction
                          prepare={prepareProposePayment}
                          csrf={csrf}
                          entityId={invoice.entityId}
                          treasuryId={defaultTreasury}
                          invoiceId={invoice.id}
                          cluster={deployment!.cluster}
                          rpcUrl={deployment!.rpcUrl}
                          label="Propose"
                        >
                          <Field label="Supplier USDC owner" className="md:col-span-2">
                            <Input name="recipientOwner" required className="font-mono" />
                          </Field>
                        </TreasuryAction>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
        {actionable ? (
          <div className="mt-4 max-w-2xl">
            <RecordForm action={createInvoiceAction} csrf={csrf} title="Record an invoice" description="Amounts are USDC. A duplicate reference for the same supplier is refused.">
              <Field label="Company">
                <NativeSelect name="entityId" required defaultValue={entities[0]?.id}>
                  {entities.map((entity) => (
                    <NativeSelectOption key={entity.id} value={entity.id}>
                      {entity.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Supplier">
                <NativeSelect name="supplierId" required defaultValue={suppliers[0]?.id}>
                  {suppliers.map((supplier) => (
                    <NativeSelectOption key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Supplier reference">
                <Input name="supplierReference" required maxLength={100} />
              </Field>
              <Field label="Amount (USDC)">
                <Input name="amount" required inputMode="decimal" placeholder="500.00" />
              </Field>
            </RecordForm>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <SectionHeader
          title="Approval inbox"
          description="Each approval is a wallet signature. The payment executes only when the policy threshold of distinct approvals is met, within the caps and before expiry."
        />
        {proposals.length === 0 ? (
          <EmptyState className="mt-4">No payment proposals yet.</EmptyState>
        ) : (
          proposals.map((proposal) => {
            const status = proposalStatus(proposal);
            const approved = proposal.approvals.filter((approval) => approval.approvedAt && !approval.revokedAt).length;
            return (
              <div key={proposal.id} className="mt-6 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {usdc(proposal.grossAmountMinor)} to <span className="font-mono text-xs">{proposal.recipientOwner}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Revision {proposal.revision} · {approved} of {treasuries.find((t) => t.id === proposal.treasuryAccountId)?.threshold ?? "?"} approvals · expires{" "}
                      {proposal.expiresAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
                {actionable && !proposal.executed && !proposal.cancelled ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <TreasuryAction prepare={prepareApprovePayment} csrf={csrf} entityId={proposal.entityId} treasuryId={proposal.treasuryAccountId} proposalId={proposal.id} cluster={deployment!.cluster} rpcUrl={deployment!.rpcUrl} label="Approve" />
                    <TreasuryAction prepare={prepareRevokeApproval} csrf={csrf} entityId={proposal.entityId} treasuryId={proposal.treasuryAccountId} proposalId={proposal.id} cluster={deployment!.cluster} rpcUrl={deployment!.rpcUrl} label="Withdraw approval" />
                    <TreasuryAction prepare={prepareExecutePayment} csrf={csrf} entityId={proposal.entityId} treasuryId={proposal.treasuryAccountId} proposalId={proposal.id} cluster={deployment!.cluster} rpcUrl={deployment!.rpcUrl} label="Execute payment">
                      <Field label="Supplier USDC account" className="md:col-span-2">
                        <Input name="recipientTokenAccount" required className="font-mono" />
                      </Field>
                    </TreasuryAction>
                    <TreasuryAction prepare={prepareCancelPayment} csrf={csrf} entityId={proposal.entityId} treasuryId={proposal.treasuryAccountId} proposalId={proposal.id} cluster={deployment!.cluster} rpcUrl={deployment!.rpcUrl} label="Cancel proposal" />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
