import { cache } from "react";
import type { SolanaDeployment } from "@/config/solana";
import { solanaDeployment } from "@/config/solana";
import { can } from "@/auth/roles";
import { hasDatabase } from "@/db/availability";
import { listSuppliers, listTreasuries, listInvoices, listProposals, type ProposalView, type TreasuryView } from "@/db/treasury";
import { listActiveWalletBindings, type WalletBindingView } from "@/db/wallet-bindings";
import { loadAuthorizedBooks } from "./authorized-books";
import type { BooksEntity } from "./books";
import type { SessionUser } from "@/auth/current";

export interface InvoiceView {
  id: string;
  entityId: string;
  supplierId: string;
  supplierReference: string;
  amountMinor: bigint;
  status: string;
}

export interface TreasuryData {
  session: SessionUser;
  configured: boolean;
  deployment: SolanaDeployment | null;
  actionable: boolean;
  entities: readonly BooksEntity[];
  bindings: WalletBindingView[];
  treasuries: TreasuryView[];
  suppliers: { id: string; entityId: string; name: string }[];
  invoices: InvoiceView[];
  proposals: ProposalView[];
}

/** The Treasury/Payables page data. Reports contracts-off rather than guessing. */
export const loadTreasury = cache(async (): Promise<TreasuryData> => {
  const { session, books } = await loadAuthorizedBooks();
  let deployment: SolanaDeployment | null = null;
  let configured = false;
  try {
    deployment = solanaDeployment();
    configured = deployment !== null;
  } catch {
    configured = false;
  }
  const writable = hasDatabase() && !session.demo;
  const actionable = configured && writable && can(session.role, "source.connect");
  if (!writable) {
    return { session, configured, deployment, actionable, entities: books.entities, bindings: [], treasuries: [], suppliers: [], invoices: [], proposals: [] };
  }
  const organizationId = session.organizationId;
  const [bindings, treasuries, suppliers, invoiceRows, proposals] = await Promise.all([
    listActiveWalletBindings(organizationId),
    listTreasuries(organizationId),
    listSuppliers(organizationId),
    listInvoices(organizationId),
    listProposals(organizationId),
  ]);
  return {
    session,
    configured,
    deployment,
    actionable,
    entities: books.entities,
    bindings,
    treasuries,
    suppliers: suppliers.map((supplier) => ({ id: supplier.id, entityId: supplier.entityId, name: supplier.name })),
    invoices: invoiceRows.map((invoice) => ({
      id: invoice.id,
      entityId: invoice.entityId,
      supplierId: invoice.supplierId,
      supplierReference: invoice.supplierReference,
      amountMinor: invoice.amountMinor,
      status: invoice.status,
    })),
    proposals,
  };
});
