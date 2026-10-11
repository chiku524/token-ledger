"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { StatusBadge } from "@/components/app/status-badge";
import { ReverseJournalForm } from "@/components/record-forms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type JournalEntryLineView = {
  lineNumber: number;
  account: string;
  source: string | null;
  quantity: string;
  debit: string;
  credit: string;
};

export type JournalEntryView = {
  id: string;
  reference: string;
  entryDate: string;
  memo: string;
  company: string;
  postedBy: string;
  correctsReference: string | null;
  amountLabel: string;
  canCorrect: boolean;
  lines: readonly JournalEntryLineView[];
};

/** Lines table and optional correction form for one journal entry. */
export function JournalEntryDetail({ entry, csrf }: { entry: JournalEntryView; csrf: string }) {
  return (
    <>
      <Table>
        <caption className="sr-only">{entry.reference} lines</caption>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Quantity</TableHead>
            <NumberHead>Debit</NumberHead>
            <NumberHead>Credit</NumberHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.lines.map((line) => (
            <TableRow key={line.lineNumber}>
              <NumberCell align="left">{line.lineNumber}</NumberCell>
              <TableCell className="min-w-40">
                {line.account}
                {line.source ? (
                  <span className="mt-1 block text-xs text-muted-foreground">{line.source}</span>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap">{line.quantity}</TableCell>
              <NumberCell>{line.debit}</NumberCell>
              <NumberCell>{line.credit}</NumberCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {entry.canCorrect ? (
        <ReverseJournalForm
          csrf={csrf}
          entry={{ id: entry.id, reference: entry.reference, entryDate: entry.entryDate }}
        />
      ) : null}
    </>
  );
}

export function JournalEntryList({ entries, csrf }: { entries: readonly JournalEntryView[]; csrf: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = entries.find((entry) => entry.id === openId) ?? null;

  return (
    <>
      <ul className="space-y-2" aria-label="Journal entries">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => setOpenId(entry.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors",
                "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{entry.reference}</span>
                  <span className="text-sm text-muted-foreground">{entry.entryDate}</span>
                </span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">
                  {entry.company} · {entry.memo}
                </span>
              </span>
              <StatusBadge tone="success" className="shrink-0">
                {entry.amountLabel}
              </StatusBadge>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl" showCloseButton>
          {selected ? (
            <>
              <DialogHeader className="border-b border-border px-4 py-4 pr-12">
                <DialogTitle className="text-lg">
                  {selected.reference}
                  <span className="ml-3 font-normal text-muted-foreground">{selected.entryDate}</span>
                </DialogTitle>
                <DialogDescription>
                  {selected.company} · {selected.memo}
                </DialogDescription>
                <p className="text-xs text-muted-foreground">
                  Posted by {selected.postedBy}
                  {selected.correctsReference ? ` · corrects ${selected.correctsReference}` : ""}
                </p>
                <div className="pt-1">
                  <StatusBadge tone="success">{selected.amountLabel}</StatusBadge>
                </div>
              </DialogHeader>
              <JournalEntryDetail entry={selected} csrf={csrf} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
