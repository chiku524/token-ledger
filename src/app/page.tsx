import Link from "next/link";
import { exampleBooks } from "@/data/example-books";
import { accountLabel, formatMoney } from "@/data/present";

const reward = exampleBooks.journalEntries.find((entry) => entry.reference === "JE-2026-004");

export default function HomePage() {
  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b border-line px-4 py-4 md:px-8">
        <p className="font-serif text-xl tracking-tight">Token Ledger</p>
        <Link href="/dashboard" className="border border-ink px-3 py-2 text-sm">
          Open the example
        </Link>
      </header>

      <main>
        <section className="grid gap-10 border-b border-line px-4 py-12 md:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)] md:px-8 md:py-16">
          <div>
            <p className="text-[0.7rem] font-medium tracking-[0.18em] text-seal uppercase">
              Malaysia · Singapore
            </p>
            <h1 className="mt-4 max-w-xl font-serif text-4xl leading-tight tracking-tight md:text-6xl">
              See every asset, wherever it is held.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              Token Ledger puts wallets, exchanges, and custodians in one view. Hot wallets, cold wallets, and staking
              sit next to exchange accounts and custodian vaults. You can match what moved with the journal, then send
              the entries to Xero, QuickBooks, or other accounting software.
            </p>
          </div>

          {reward ? (
            <article className="border border-line bg-paper-raised p-5">
              <p className="text-[0.7rem] font-medium tracking-[0.16em] text-ink-soft uppercase">Sample entry</p>
              <h2 className="mt-2 font-serif text-2xl">{reward.reference}</h2>
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

        <section className="grid border-b border-line md:grid-cols-3">
          {[
            {
              title: "See it all",
              body: "Wallets, exchanges, and custodians — on Ethereum, Solana, and Polygon — show up as one list of what you hold.",
            },
            {
              title: "Check it",
              body: "Activity from each place is compared with the journal. Anything that does not match stays visible.",
            },
            {
              title: "Report it",
              body: "Balances and crypto values for each company, then one combined view. The same entries can go to Xero, QuickBooks, or other accounting software.",
            },
          ].map((item) => (
            <article key={item.title} className="border-b border-line px-4 py-8 md:border-r md:border-b-0 md:px-8 last:md:border-r-0">
              <h2 className="font-serif text-2xl">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-8 px-4 py-12 md:grid-cols-2 md:px-8">
          <div>
            <h2 className="font-serif text-3xl">Planned tiers</h2>
            <div className="mt-6 grid gap-4">
              <article className="border border-line bg-paper-raised p-5">
                <h3 className="font-medium">Startup</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Web3 startups and funds. Quarterly reports from the same books.
                </p>
              </article>
              <article className="border border-line bg-paper-raised p-5">
                <h3 className="font-medium">Institutional</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Banks, funds, and growing Web3 companies. Monthly reports, several companies in one view, and asset values.
                </p>
              </article>
            </div>
          </div>
          <div>
            <h2 className="font-serif text-3xl">Later, not in this build</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink-soft">
              <li>Token treasury and lifecycle management for issuers.</li>
              <li>An AI-assisted close that drafts, not posts, adjusting entries.</li>
              <li>Live connections to wallets, exchanges, custodians, Xero, and QuickBooks. The hooks are in place and make no network calls.</li>
            </ul>
            <p className="mt-8 text-sm leading-relaxed text-ink-soft">
              The example uses Harbourline Digital, a fictional group in Malaysia and Singapore. The account names in the
              sample are examples, not a recommendation.
            </p>
            <Link href="/dashboard" className="mt-6 inline-block border border-ink px-3 py-2 text-sm">
              See the Q2 2026 example
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
