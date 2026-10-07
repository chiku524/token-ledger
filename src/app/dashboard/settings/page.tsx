import Link from "next/link";
import { ensureCsrf } from "@/auth/current";
import { can, roleLabel } from "@/auth/roles";
import { changeNameAction } from "@/app/dashboard/user-actions";
import { createConnectionAction } from "@/app/dashboard/actions";
import { CUSTODIANS } from "@/adapters/sources/custodian/registry";
import { ConnectModal } from "@/components/connect-modal";
import { WatchWalletFields } from "@/components/track-wallet-fields";
import { connectExchanges } from "@/data/connect-catalog";
import { ConnectionsTable } from "@/components/app/connections-table";
import { EmptyState } from "@/components/app/empty-state";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { SectionHeader } from "@/components/app/section-header";
import { SubmitButton } from "@/components/submit-button";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { reownProjectId } from "@/env";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const writable = booksAreWritable() && !session.demo;
  const canSource = can(session.role, "source.write");
  const canConnect = can(session.role, "source.connect");
  const csrf = await ensureCsrf();

  return (
    <>
      <PageHeader
        kicker="Account"
        title="Settings"
        description="Your account, and the read-only connections for this organization. A connection cannot withdraw, trade, or sign."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />

      <section>
        <SectionHeader title="Your details" />
        <FormCard action={changeNameAction} className="mt-4 md:grid-cols-2">
          <input type="hidden" name="csrf" value={csrf} />
          <Field label="Name">
            <Input name="name" required maxLength={80} defaultValue={session.name} autoComplete="name" />
          </Field>
          <div className="flex items-end">
            <SubmitButton>Save name</SubmitButton>
          </div>
          <p className="text-sm text-muted-foreground md:col-span-2">
            {session.demo
              ? "This demo is read-only, so a change lasts for this session only and is not saved."
              : "Your email is the sign-in identity and is changed separately."}
          </p>
          <dl className="grid gap-3 border-t border-border pt-4 text-sm md:col-span-2 md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-1">{session.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="mt-1">{roleLabel(session.role)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="mt-1">{books.organization.name}</dd>
            </div>
          </dl>
        </FormCard>
      </section>

      {canSource ? (
        <section id="track-wallet" className="mt-10 scroll-mt-6">
          <SectionHeader
            title="Track a wallet address"
            description="Add any public address to track. No wallet connection and no signature are required — paste an address and it is read-only. Use this for a cold address, a customer wallet, or any address you cannot sign with."
          />
          {books.entities.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Add a company before tracking a wallet.</p>
          ) : (
            <FormCard action={createConnectionAction} className="mt-4 md:grid-cols-2">
              <WatchWalletFields books={books} csrf={csrf} next="/dashboard/settings" />
            </FormCard>
          )}
        </section>
      ) : null}

      <section id="connections" className="mt-10 scroll-mt-6">
        <SectionHeader
          title="Connections"
          description="Add a wallet, an exchange, or a custodian here. One connection can cover several accounts. Connections stay read-only — scopes are balances and movements."
          action={
            canSource ? (
              <Link href="/dashboard/setup" className="text-sm text-link underline">
                Open the connection steps
              </Link>
            ) : undefined
          }
        />
        {!writable && canSource ? <div className="mt-4"><ReadOnlyNote demo={session.demo} /></div> : null}
        {!canSource ? (
          <div className="mt-4">
            <RoleNote>
              {canConnect
                ? "You can connect and sign your own wallet above. Adding an exchange or custodian, tracking an arbitrary address, checking, or disconnecting is for an owner or an admin."
                : "You can view connections. Adding, checking, or disconnecting one is for an owner or an admin."}
            </RoleNote>
          </div>
        ) : null}
        {books.connections.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Link2}
            action={
              canSource ? (
                <Button asChild variant="secondary">
                  <Link href="/dashboard/setup">Open the connection steps</Link>
                </Button>
              ) : undefined
            }
          >
            No connections yet.
          </EmptyState>
        ) : (
          <ConnectionsTable books={books} controls={canSource && writable ? { csrf } : undefined} />
        )}
      </section>

      {canConnect && books.entities.length > 0 ? (
        <div className="mt-8">
          <ConnectModal
            csrf={csrf}
            next="/dashboard/settings"
            books={books}
            projectId={reownProjectId()}
            canWrite={canSource}
            exchanges={connectExchanges()}
            custodians={Object.values(CUSTODIANS).map((item) => ({ key: item.key, label: item.label }))}
          />
        </div>
      ) : null}
      {canConnect && books.entities.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Add a company before connecting a wallet, exchange, or custodian.</p>
      ) : null}
    </>
  );
}
