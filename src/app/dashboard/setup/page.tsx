import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { CUSTODIANS } from "@/adapters/sources/custodian/registry";
import { ConnectModal } from "@/components/connect-modal";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ReadOnlyNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { connectExchanges } from "@/data/connect-catalog";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { SETUP_FLOW, setupStep } from "@/data/setup-flow";
import { reownProjectId } from "@/env";

export const metadata = { title: "Connect" };

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[]; step?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  if (!can(session.role, "source.write")) redirect("/dashboard");

  const current = setupStep(one(params.step));
  const writable = booksAreWritable() && !session.demo;
  const csrf = writable ? await ensureCsrf() : "";
  const step = current.id === "done" ? null : SETUP_FLOW[current.index];

  return (
    <>
      <PageHeader
        kicker="Connect"
        title={step ? step.title : "Connections are ready"}
        description="Open Connect, pick a wallet or an exchange, and approve read-only access. Nothing here can move funds."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      <p className="eyebrow">
        {current.id === "done" ? "Done" : `Step ${current.index + 1} of ${SETUP_FLOW.length}`}
      </p>
      {!writable ? (
        <div className="mt-4">
          <ReadOnlyNote demo={session.demo} />
        </div>
      ) : null}
      {step && writable && books.entities.length > 0 ? (
        <div className="mt-4 max-w-2xl">
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">{step.lede}</p>
          <ConnectModal
            csrf={csrf}
            next={step.next}
            books={books}
            projectId={reownProjectId()}
            defaultOpen
            exchanges={connectExchanges()}
            custodians={Object.values(CUSTODIANS).map((item) => ({ key: item.key, label: item.label }))}
          />
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {current.index > 0 ? (
              <Button asChild variant="secondary">
                <Link href={`/dashboard/setup?step=${SETUP_FLOW[current.index - 1]?.id ?? "wallet"}`}>Back</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href={step.next}>{step.skip}</Link>
            </Button>
          </div>
        </div>
      ) : null}
      {step && writable && books.entities.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Add a company before connecting a wallet, exchange, or custodian.</p>
      ) : null}
      {current.id === "done" ? (
        <Card className="mt-4 max-w-2xl">
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Skipped steps stay empty. Holdings shows what was observed. Settings is where you add another connection,
              check one, or disconnect it.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard/settings">Open settings</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/sources">View holdings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
