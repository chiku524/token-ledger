import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatusBadge } from "@/components/app/status-badge";
import { TableCard } from "@/components/app/table-card";
import { NumberCell } from "@/components/app/table-cells";
import { Field } from "@/components/app/field";
import { RecordForm, TreasuryAction } from "@/components/treasury-controls";
import { createSupplierAction, prepareInitializeTreasury, prepareTreasuryDeposit } from "@/app/dashboard/treasury-actions";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { loadTreasury } from "@/data/load-treasury";
import { entityName } from "@/data/present";
import { formatMinor } from "@/ledger";
import { USDC_DECIMALS } from "@/config/solana";
import { requireSectionAccess } from "@/data/section-access";

export const metadata = { title: "Treasury" };

function usdc(amountMinor: bigint): string {
  return `USDC ${formatMinor(amountMinor, USDC_DECIMALS, { minFraction: 2, maxFraction: 2 })}`;
}

export default async function TreasuryPage() {
  const { configured, deployment, actionable, entities, treasuries, suppliers } = await loadTreasury();
  await requireSectionAccess("/dashboard/treasury");
  const csrf = await ensureCsrf();

  return (
    <>
      <PageHeader
        kicker="Accounts Payable"
        title="Treasury"
        description="A separately funded USDC treasury with a signer policy. Every payment needs a threshold of distinct approvals within the limits; Token Ledger support has no override, and connecting a read-only wallet never enables spending."
      />

      {!configured ? (
        <Alert variant="warning" className="mb-6 max-w-2xl">
          The contract features are not configured on this deployment. Set the Solana cluster and program ids to enable the
          treasury.
        </Alert>
      ) : null}

      {treasuries.length === 0 ? (
        <EmptyState className="mt-4">No treasury yet. Initialize one below with a signer policy.</EmptyState>
      ) : (
        treasuries.map((treasury) => (
          <section key={treasury.id} className="mt-8">
            <SectionHeader
              title={`${entityName(treasury.entityId, entities)} · ${treasury.threshold}-of-${treasury.approverCount}`}
              description={
                <>
                  Recovery wallet <span className="font-mono text-xs">{treasury.recoveryAddress}</span>. Per-payment{" "}
                  {usdc(treasury.perPaymentLimitMinor)}, daily {usdc(treasury.dailyLimitMinor)}.
                </>
              }
              action={
                <StatusBadge tone={treasury.executionPaused ? "danger" : treasury.closed ? "neutral" : "success"}>
                  {treasury.executionPaused ? "Paused" : treasury.closed ? "Closed" : "Active"}
                </StatusBadge>
              }
            />
            <TableCard>
              <Table>
                <caption className="sr-only">Treasury signers</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Wallet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treasury.signers.map((signer) => (
                    <TableRow key={`${signer.role}-${signer.address}`}>
                      <TableCell className="capitalize">{signer.role}</TableCell>
                      <NumberCell align="left" className="break-all">
                        {signer.address}
                      </NumberCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
            {actionable ? (
              <div className="mt-4 max-w-2xl">
                <TreasuryAction
                  prepare={prepareTreasuryDeposit}
                  csrf={csrf}
                  entityId={treasury.entityId}
                  treasuryId={treasury.id}
                  cluster={deployment!.cluster}
                  rpcUrl={deployment!.rpcUrl}
                  label="Fund treasury"
                  description="Move USDC into the treasury. No connected read-only wallet is swept."
                >
                  <Field label="Amount (USDC)">
                    <Input name="amount" required inputMode="decimal" placeholder="10000.00" />
                  </Field>
                  <Field label="Funder USDC account">
                    <Input name="funderTokenAccount" required className="font-mono" placeholder="Token account" />
                  </Field>
                </TreasuryAction>
              </div>
            ) : null}
          </section>
        ))
      )}

      {actionable && entities.length > 0 ? (
        <section className="mt-10">
          <SectionHeader
            title="Initialize a treasury"
            description="Set the signer policy: a threshold of approvers, proposers who may raise payments, per-payment and daily limits, and a recovery wallet. Support cannot override the threshold."
          />
          <div className="mt-4 max-w-2xl">
            <TreasuryAction
              prepare={prepareInitializeTreasury}
              csrf={csrf}
              entityId={entities[0]!.id}
              cluster={deployment!.cluster}
              rpcUrl={deployment!.rpcUrl}
              label="Initialize treasury"
            >
              <Field label="Approvers" hint="Wallet addresses, comma or space separated." className="md:col-span-2">
                <Input name="approvers" required className="font-mono" />
              </Field>
              <Field label="Proposers" hint="Wallets allowed to propose a payment." className="md:col-span-2">
                <Input name="proposers" required className="font-mono" />
              </Field>
              <Field label="Threshold">
                <Input name="threshold" required type="number" min={1} max={10} defaultValue={2} />
              </Field>
              <Field label="Proposal lifetime (days)">
                <Input name="maxProposalLifetimeDays" required type="number" min={1} max={90} defaultValue={7} />
              </Field>
              <Field label="Per-payment limit (USDC)">
                <Input name="perPaymentLimit" required inputMode="decimal" placeholder="5000.00" />
              </Field>
              <Field label="Daily limit (USDC)">
                <Input name="dailyLimit" required inputMode="decimal" placeholder="20000.00" />
              </Field>
              <Field label="Recovery wallet" className="md:col-span-2">
                <Input name="recovery" required className="font-mono" />
              </Field>
            </TreasuryAction>
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <SectionHeader
          title="Suppliers"
          description="Private supplier records. Names and details stay off-chain; the chain sees only an opaque invoice key."
        />
        {suppliers.length === 0 ? (
          <EmptyState className="mt-4">No suppliers yet.</EmptyState>
        ) : (
          <TableCard>
            <Table>
              <caption className="sr-only">Suppliers</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>{entityName(supplier.entityId, entities)}</TableCell>
                    <TableCell>{supplier.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
        {actionable ? (
          <div className="mt-4 max-w-2xl">
            <RecordForm action={createSupplierAction} csrf={csrf} title="Add a supplier">
              <Field label="Company">
                <NativeSelect name="entityId" required defaultValue={entities[0]?.id}>
                  {entities.map((entity) => (
                    <NativeSelectOption key={entity.id} value={entity.id}>
                      {entity.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Supplier name">
                <Input name="name" required maxLength={200} />
              </Field>
            </RecordForm>
          </div>
        ) : null}
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        Invoices, payment proposals and the approval inbox are on the{" "}
        <Link href="/dashboard/payables" className="text-link underline">
          Payables
        </Link>{" "}
        page.
      </p>
    </>
  );
}
