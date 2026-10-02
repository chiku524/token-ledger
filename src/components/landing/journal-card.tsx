import { Check, FileText } from "lucide-react";
import { journal, money } from "@/components/landing/sample-data";
import { cn } from "@/lib/utils";

export function JournalCard({ className }: { className?: string }) {
  return (
    <section
      aria-label="Balanced journal entry"
      className={cn(
        "rounded-xl border border-white/50 bg-cloud p-4 text-night shadow-[0_16px_48px_#0003] sm:p-5",
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="hidden rounded-xl bg-brand/10 p-2.5 text-brand sm:block">
            <FileText className="size-5" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-bold">Staking reward</h3>
            <p className="mt-1 text-[10px] text-slate-600">JE-2026-004 · 30 Apr 2026</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-[#e0f5c7] px-2.5 py-1.5 text-[10px] font-semibold text-[#2e5013]">
          <Check className="size-3" aria-hidden /> Balanced
        </span>
      </div>
      <table className="w-full text-left text-[10px] sm:text-[11px]">
        <caption className="sr-only">Journal entry JE-2026-004 in Malaysian ringgit</caption>
        <thead className="border-b border-slate-200 text-[9px] uppercase tracking-[.12em] text-slate-600">
          <tr>
            <th scope="col" className="pb-2 font-medium">
              Account
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Debit (MYR)
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Credit (MYR)
            </th>
          </tr>
        </thead>
        <tbody>
          {journal.map((row) => (
            <tr key={row.account} className="border-b border-slate-200 last:border-0">
              <th scope="row" className="py-2.5 font-medium">
                {row.account}
              </th>
              <td className="py-2.5 text-right font-mono">{row.debit ? money(row.debit, 2) : "—"}</td>
              <td className="py-2.5 text-right font-mono">{row.credit ? money(row.credit, 2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
