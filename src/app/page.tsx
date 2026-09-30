import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { exampleBooks } from "@/data/example-books";
import { accountLabel, formatMoney } from "@/data/present";

const reward = exampleBooks.journalEntries.find((entry) => entry.reference === "JE-2026-004");

const features = [
  {
    title: "See it all",
    body: "Wallets, exchanges, and custodians are read-only connections. Addresses, accounts, and vaults show up as one list of what you hold.",
  },
  {
    title: "Check it",
    body: "Activity from each place is compared with the journal. Anything that does not match stays visible.",
  },
  {
    title: "Report it",
    body: "Balances and crypto values for each company, then one combined view. The same entries can go to Xero, QuickBooks, or other accounting software.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-5 md:px-8">
        <p className="text-base font-semibold tracking-tight whitespace-nowrap">Token Ledger</p>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <Link href="/sign-in?next=/dashboard" className="btn-secondary">
            Open the example
          </Link>
          <Link href="/sign-up" className="btn">
            Create an account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        <section className="grid items-start gap-8 py-8 md:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.8fr)] md:py-14">
          <div>
            <p className="text-sm font-medium text-accent">Malaysia · Singapore</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight md:text-5xl">
              See every asset, wherever it is held.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
              Token Ledger puts wallets, exchanges, and custodians in one view. Hot wallets, cold wallets, and staking
              sit next to exchange accounts and custodian vaults. You can match what moved with the journal, then send
              the entries to Xero, QuickBooks, or other accounting software.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/sign-up" className="btn">
                Create an account
              </Link>
              <Link href="/sign-in?next=/dashboard" className="btn-secondary">
                See the Q2 2026 example
              </Link>
            </div>
          </div>

          {reward ? (
            <article className="panel p-5">
              <p className="text-xs font-medium text-ink-soft">Sample entry</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">{reward.reference}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{reward.memo}</p>
              <table className="ledger-table mt-4">
                <caption className="sr-only">Sample staking reward</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col" className="num">Debit</th>
                    <th scope="col" className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {reward.lines.map((line) => (
                    <tr key={line.lineNumber}>
                      <td>{accountLabel(reward.entityId, line.accountCode)}</td>
                      <td className="num">{line.side === "debit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                      <td className="num">{line.side === "credit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-pine">
                Both sides match · {formatMoney(reward.debitMinor, reward.currency)}
              </p>
            </article>
          ) : null}
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {features.map((item) => (
            <article key={item.title} className="panel p-5">
              <h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Planned tiers</h2>
            <div className="mt-4 grid gap-3">
              <article className="panel p-5">
                <h3 className="font-medium">Startup</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Web3 startups and funds. Quarterly reports from the same books.
                </p>
              </article>
              <article className="panel p-5">
                <h3 className="font-medium">Institutional</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Banks, funds, and growing Web3 companies. Monthly reports, several companies in one view, and asset values.
                </p>
              </article>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Later, not in this build</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
              <li>Token treasury and lifecycle management for issuers.</li>
              <li>An AI-assisted close that drafts, not posts, adjusting entries.</li>
              <li>Live connections to wallets, exchanges, custodians, Xero, and QuickBooks. The hooks are in place and make no network calls.</li>
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-ink-soft">
              The example uses Harbourline Digital, a fictional group in Malaysia and Singapore. The account names in the
              sample are examples, not a recommendation.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
