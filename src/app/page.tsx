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
          Open example books
        </Link>
      </header>

      <main>
        <section className="grid gap-10 border-b border-line px-4 py-12 md:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)] md:px-8 md:py-16">
          <div>
            <p className="text-[0.7rem] font-medium tracking-[0.18em] text-seal uppercase">
              Malaysia · Singapore · IFRS
            </p>
            <h1 className="mt-4 max-w-xl font-serif text-4xl leading-tight tracking-tight md:text-6xl">
              One subledger for crypto that is scattered across wallets, chains, and venues.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              Token Ledger is an accounting layer for digital assets. It consolidates holdings from hot wallets,
              cold storage, staking positions, custodians, and exchanges into a double-entry subledger with an audit
              trail, reconciliation back to every source, and IFRS reporting that can sync to Xero, QuickBooks, and ERPs.
            </p>
          </div>

          {reward ? (
            <article className="border border-line bg-paper-raised p-5">
              <p className="text-[0.7rem] font-medium tracking-[0.16em] text-ink-soft uppercase">Posted example</p>
              <h2 className="mt-2 font-serif text-2xl">{reward.reference}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{reward.memo}</p>
              <table className="ledger-table mt-4">
                <caption className="sr-only">Illustrative staking-reward journal</caption>
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
                Debits {formatMoney(reward.debitMinor, reward.currency)} = credits{" "}
                {formatMoney(reward.creditMinor, reward.currency)}
              </p>
            </article>
          ) : null}
        </section>

        <section className="grid border-b border-line md:grid-cols-3">
          {[
            {
              title: "Consolidate",
              body: "Entities, wallets, exchanges, and custodians — including chain context for Ethereum, Solana, and Polygon — land in one chart of accounts.",
            },
            {
              title: "Reconcile",
              body: "Each source transaction is matched to a ledger movement. Breaks stay visible as exceptions instead of disappearing into a spreadsheet.",
            },
            {
              title: "Report",
              body: "Trial balances and carrying amounts are labelled with the measurement basis the entity uses under IFRS, then shaped for Xero, QuickBooks, or an ERP.",
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
                  Web3 startups and funds. Quarterly reporting from the same subledger, without a second set of books.
                </p>
              </article>
              <article className="border border-line bg-paper-raised p-5">
                <h3 className="font-medium">Institutional</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  TradFi and scaling Web3 firms. Monthly reporting, multi-entity consolidation, and asset valuation reporting.
                </p>
              </article>
            </div>
          </div>
          <div>
            <h2 className="font-serif text-3xl">Later, not in this build</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink-soft">
              <li>Token treasury and lifecycle management for issuers.</li>
              <li>An AI-assisted close that drafts, not posts, adjusting entries.</li>
              <li>Live chain, exchange, custodian, Xero, and QuickBooks connectors. The interfaces are stubbed and make no network calls.</li>
            </ul>
            <p className="mt-8 text-sm leading-relaxed text-ink-soft">
              The example dashboard uses Harbourline Digital, a fictional Malaysia and Singapore group. Measurement bases
              in the chart of accounts are labels for the sample, not a recommended policy.
            </p>
            <Link href="/dashboard" className="mt-6 inline-block border border-ink px-3 py-2 text-sm">
              Review the Q2 2026 example close
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
