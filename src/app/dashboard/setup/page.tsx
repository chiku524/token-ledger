import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { ConnectorForm } from "@/components/connector-form";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { ReadOnlyNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { SETUP_FLOW, setupStep } from "@/data/setup-flow";

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
        description="Connect a wallet, an exchange, a custodian, or any combination. Skip any step. Nothing here can move funds."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      <p className="kicker">
        {current.id === "done" ? "Done" : `Step ${current.index + 1} of ${SETUP_FLOW.length}`}
      </p>
      {!writable ? (
        <div className="mt-4">
          <ReadOnlyNote demo={session.demo} />
        </div>
      ) : null}
      {step && writable && books.entities.length > 0 ? (
        <div className="mt-4 max-w-2xl">
          <ConnectorForm
            id={step.id}
            books={books}
            csrf={csrf}
            mode={step.mode}
            next={step.next}
            title={step.title}
            intro={step.lede}
          />
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {current.index > 0 ? (
              <Link href={`/dashboard/setup?step=${SETUP_FLOW[current.index - 1]?.id ?? "wallet"}`} className="btn-secondary">
                Back
              </Link>
            ) : null}
            <Link href={step.next} className="btn-secondary">
              {step.skip}
            </Link>
          </div>
        </div>
      ) : null}
      {step && writable && books.entities.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Add a company before connecting a wallet, exchange, or custodian.</p>
      ) : null}
      {current.id === "done" ? (
        <div className="mt-4 max-w-2xl panel p-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Skipped steps stay empty. Holdings shows what was observed. Settings is where you add another connection,
            check one, or disconnect it.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/settings" className="btn">
              Open settings
            </Link>
            <Link href="/dashboard/sources" className="btn-secondary">
              View holdings
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
