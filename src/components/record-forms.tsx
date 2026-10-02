import {
  approveDraftAction,
  closePeriodAction,
  createEntityAction,
  createFxRateAction,
  importCsvAction,
  postJournalAction,
  postRevaluationAction,
  prepareJournalAction,
  refreshConnectionAction,
  refreshMarketDataAction,
  matchReconciliationAction,
  reverseJournalAction,
  revokeConnectionAction,
  submitDraftAction,
  unmatchReconciliationAction,
} from "@/app/dashboard/actions";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup as OptGroup, NativeSelectOption as Option } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Books } from "@/data/books";

export function ReadOnlyNote({ demo = false }: { demo?: boolean }) {
  return (
    <p className="mb-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
      {demo
        ? "This demo does not save. Connect a database, then sign in with a password."
        : "This sample is read-only. Connect a database to add companies, wallets, and entries."}
    </p>
  );
}

export function RoleNote({ children }: { children: string }) {
  return <p className="mb-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

export function EntityForm({ books, csrf }: { books: Books; csrf: string }) {
  return (
    <FormCard action={createEntityAction} title="Add a company" className="mb-10 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <Field label="Name">
        <Input name="name" required maxLength={200} autoComplete="organization" />
      </Field>
      <Field label="Country code">
        <Input name="jurisdiction" required maxLength={2} placeholder="MY" className="uppercase" />
      </Field>
      <Field label="Currency">
        <NativeSelect name="functionalCurrency" defaultValue="MYR">
          <Option value="MYR">MYR</Option>
          <Option value="SGD">SGD</Option>
          <Option value="USD">USD</Option>
        </NativeSelect>
      </Field>
      <Field label="Reporting standard">
        <Input name="reportingFramework" required defaultValue="IFRS" maxLength={40} />
      </Field>
      <Field label="Parent company">
        <NativeSelect name="parentEntityId" defaultValue="">
          <Option value="">None — this is the parent</Option>
          {books.entities.map((entity) => (
            <Option key={entity.id} value={entity.id}>
              {entity.name}
            </Option>
          ))}
        </NativeSelect>
      </Field>
      <div className="md:col-span-2">
        <SubmitButton>Add company</SubmitButton>
      </div>
    </FormCard>
  );
}

export function ConnectionControls({
  connectionId,
  csrf,
  revoked,
  next = "/dashboard/settings",
}: {
  connectionId: string;
  csrf: string;
  revoked: boolean;
  next?: string;
}) {
  if (revoked) return <span className="text-sm text-muted-foreground">Disconnected</span>;
  return (
    <div className="flex flex-wrap gap-2">
      <form action={refreshConnectionAction}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="connectionId" value={connectionId} />
        <SubmitButton variant="secondary">Check</SubmitButton>
      </form>
      <form action={revokeConnectionAction}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="connectionId" value={connectionId} />
        <SubmitButton variant="secondary">Disconnect</SubmitButton>
      </form>
    </div>
  );
}

export function PeriodCloseForm({
  entities,
  csrf,
  defaultDate,
}: {
  entities: readonly { id: string; name: string }[];
  csrf: string;
  defaultDate: string;
}) {
  if (entities.length === 0) return null;
  return (
    <FormCard action={closePeriodAction} title="Close a period" headingLevel="h3" className="mt-4 md:grid-cols-4">
      <input type="hidden" name="csrf" value={csrf} />
      <Field label="Company">
        <NativeSelect name="entityId" required defaultValue={entities[0]?.id}>
          {entities.map((entity) => (
            <Option key={entity.id} value={entity.id}>
              {entity.name}
            </Option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="From">
        <Input name="periodStart" type="date" required defaultValue={defaultDate} />
      </Field>
      <Field label="To">
        <Input name="periodEnd" type="date" required defaultValue={defaultDate} />
      </Field>
      <Field label="Note">
        <Input name="note" required maxLength={200} placeholder="Why this is closed" />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>Close period</SubmitButton>
      </div>
    </FormCard>
  );
}

export function MatchControls({
  sourceTransactionId,
  candidates,
  csrf,
}: {
  sourceTransactionId: string;
  candidates: Array<{ id: string; label: string }>;
  csrf: string;
}) {
  return (
    <form action={matchReconciliationAction} className="grid gap-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="sourceTransactionId" value={sourceTransactionId} />
      <NativeSelect name="journalLine" required aria-label="Journal line">
        <Option value="">Choose a journal line…</Option>
        {candidates.map((candidate) => (
          <Option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </Option>
        ))}
      </NativeSelect>
      <Input name="note" required maxLength={200} placeholder="Why this match" aria-label="Note" />
      <SubmitButton variant="secondary">Match</SubmitButton>
    </form>
  );
}

export function UnmatchControls({ sourceTransactionId, csrf }: { sourceTransactionId: string; csrf: string }) {
  return (
    <form action={unmatchReconciliationAction} className="grid gap-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="sourceTransactionId" value={sourceTransactionId} />
      <Input name="note" required maxLength={200} placeholder="Why this is not a match" aria-label="Note" />
      <SubmitButton variant="secondary">Unmatch</SubmitButton>
    </form>
  );
}

export function DraftSubmitControls({ draftId, csrf }: { draftId: string; csrf: string }) {
  return (
    <form action={submitDraftAction}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="draftId" value={draftId} />
      <SubmitButton variant="secondary">Submit for approval</SubmitButton>
    </form>
  );
}

export function DraftApprovalControls({ draftId, csrf, isOwner }: { draftId: string; csrf: string; isOwner: boolean }) {
  return (
    <form action={approveDraftAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="draftId" value={draftId} />
      {isOwner ? (
        <Input
          name="overrideNote"
          placeholder="Owner override note (only if you prepared it)"
          maxLength={200}
          aria-label="Owner override note"
          className="w-72"
        />
      ) : null}
      <SubmitButton>Approve and post</SubmitButton>
    </form>
  );
}

export function RevaluationForm({ entityId, asOf, csrf }: { entityId: string; asOf: string; csrf: string }) {
  return (
    <FormCard action={postRevaluationAction} className="mt-4 flex flex-wrap items-end">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="asOf" value={asOf} />
      <Field label="Reference">
        <Input name="reference" required maxLength={40} placeholder="REVAL-2026-06" />
      </Field>
      <SubmitButton>Post revaluation entry</SubmitButton>
      <span className="text-sm text-muted-foreground">
        Posts one balanced entry for the net difference. Reverse it if the price was wrong.
      </span>
    </FormCard>
  );
}

export function MarketDataControls({ csrf, next = "/dashboard/sources" }: { csrf: string; next?: string }) {
  return (
    <form action={refreshMarketDataAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton variant="secondary">Refresh prices and rates</SubmitButton>
      <span className="text-sm text-muted-foreground">
        Fetches live prices and FX rates, stored with their source and date. Never posts a journal.
      </span>
    </form>
  );
}

export function CsvImportForm({ books, csrf }: { books: Books; csrf: string }) {
  return (
    <FormCard
      action={importCsvAction}
      title="Import activity"
      description="Columns: external_id, occurred_on, asset_code, direction (in or out), quantity, description. Quantity is the amount people see, such as 0.1 ETH. This records what moved at that wallet, exchange, or custodian. It does not create a journal entry."
    >
      <input type="hidden" name="csrf" value={csrf} />
      <Field label="Held at">
        <NativeSelect name="sourceId" required defaultValue={books.sources[0]?.id}>
          {books.sources.map((source) => (
            <Option key={source.id} value={source.id}>
              {source.name}
            </Option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="CSV file">
        <Input name="file" type="file" accept=".csv,text/csv" />
      </Field>
      <Field label="Or paste CSV">
        <Textarea name="csv" rows={4} spellCheck={false} className="font-mono text-xs" />
      </Field>
      <div>
        <SubmitButton>Import activity</SubmitButton>
      </div>
    </FormCard>
  );
}

export function JournalForm({ books, csrf }: { books: Books; csrf: string }) {
  const accounts = books.accounts;
  return (
    <FormCard
      action={postJournalAction}
      title="Post an entry"
      description="Debits must equal credits, in the company's currency. Leave unused lines blank. A token amount needs the asset, whether it was received or sent, and where it was held."
      className="mb-10"
    >
      <input type="hidden" name="csrf" value={csrf} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Company">
          <NativeSelect name="entityId" required defaultValue={books.entities[0]?.id}>
            {books.entities.map((entity) => (
              <Option key={entity.id} value={entity.id}>
                {entity.name}
              </Option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Reference">
          <Input name="reference" required maxLength={40} />
        </Field>
        <Field label="Date">
          <Input name="entryDate" type="date" required defaultValue={books.period.end} />
        </Field>
        <Field label="Memo" className="md:col-span-2">
          <Input name="memo" required maxLength={500} />
        </Field>
      </div>
      <div className="rounded-lg border border-border">
        <Table>
          <caption className="sr-only">Journal lines</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Account</TableHead>
              <TableHead scope="col">Side</TableHead>
              <TableHead scope="col">Amount</TableHead>
              <TableHead scope="col">Asset</TableHead>
              <TableHead scope="col">Quantity</TableHead>
              <TableHead scope="col">Movement</TableHead>
              <TableHead scope="col">Held at</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[0, 1, 2, 3].map((index) => (
              <TableRow key={index}>
                <TableCell className="px-2 py-2">
                  <label className="sr-only" htmlFor={`line${index}_account`}>
                    Line {index + 1} account
                  </label>
                  <NativeSelect id={`line${index}_account`} name={`line${index}_account`} defaultValue="" className="min-w-44">
                    <Option value="">—</Option>
                    {books.entities.map((entity) => (
                      <OptGroup key={entity.id} label={entity.name}>
                        {accounts
                          .filter((account) => account.entityId === entity.id)
                          .map((account) => (
                            <Option key={account.id} value={account.code}>
                              {account.code} {account.name}
                            </Option>
                          ))}
                      </OptGroup>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell className="px-2 py-2">
                  <label className="sr-only" htmlFor={`line${index}_side`}>
                    Line {index + 1} side
                  </label>
                  <NativeSelect id={`line${index}_side`} name={`line${index}_side`} defaultValue="debit" className="min-w-28">
                    <Option value="debit">Debit</Option>
                    <Option value="credit">Credit</Option>
                  </NativeSelect>
                </TableCell>
                <TableCell className="px-2 py-2">
                  <label className="sr-only" htmlFor={`line${index}_amount`}>
                    Line {index + 1} amount
                  </label>
                  <Input id={`line${index}_amount`} name={`line${index}_amount`} inputMode="decimal" className="w-28" />
                </TableCell>
                <TableCell className="px-2 py-2">
                  <label className="sr-only" htmlFor={`line${index}_asset`}>
                    Line {index + 1} asset
                  </label>
                  <NativeSelect id={`line${index}_asset`} name={`line${index}_asset`} defaultValue="" className="min-w-24">
                    <Option value="">—</Option>
                    {books.assets.map((asset) => (
                      <Option key={asset.id} value={asset.code}>
                        {asset.code}
                      </Option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell className="px-2 py-2">
                  <label className="sr-only" htmlFor={`line${index}_quantity`}>
                    Line {index + 1} quantity
                  </label>
                  <Input id={`line${index}_quantity`} name={`line${index}_quantity`} inputMode="decimal" className="w-24" />
                </TableCell>
                <TableCell className="px-2 py-2">
                  <label className="sr-only" htmlFor={`line${index}_direction`}>
                    Line {index + 1} movement
                  </label>
                  <NativeSelect id={`line${index}_direction`} name={`line${index}_direction`} defaultValue="" className="min-w-32">
                    <Option value="">—</Option>
                    <Option value="in">Received</Option>
                    <Option value="out">Sent</Option>
                  </NativeSelect>
                </TableCell>
                <TableCell className="px-2 py-2">
                  <label className="sr-only" htmlFor={`line${index}_source`}>
                    Line {index + 1} held at
                  </label>
                  <NativeSelect id={`line${index}_source`} name={`line${index}_source`} defaultValue="" className="min-w-40">
                    <Option value="">—</Option>
                    {books.sources.map((source) => (
                      <Option key={source.id} value={source.id}>
                        {source.name}
                      </Option>
                    ))}
                  </NativeSelect>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Post entry</SubmitButton>
        <SubmitButton variant="secondary" formAction={prepareJournalAction}>
          Save as draft
        </SubmitButton>
        <span className="text-sm text-muted-foreground">A draft is not in the books until an approver posts it.</span>
      </div>
    </FormCard>
  );
}

export function ReverseJournalForm({
  csrf,
  entry,
}: {
  csrf: string;
  entry: { id: string; reference: string; entryDate: string };
}) {
  return (
    <form action={reverseJournalAction} className="grid gap-3 border-t border-border px-4 py-3 md:grid-cols-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="entryId" value={entry.id} />
      <Field label="Correction reference">
        <Input name="reference" required defaultValue={`${entry.reference}-R`} maxLength={40} />
      </Field>
      <Field label="Correction date">
        <Input name="entryDate" type="date" required defaultValue={entry.entryDate} />
      </Field>
      <Field label="Memo" className="md:col-span-3">
        <Input name="memo" required maxLength={500} defaultValue={`Correct ${entry.reference}.`} />
      </Field>
      <div className="md:col-span-3">
        <SubmitButton variant="secondary">Post correction</SubmitButton>
      </div>
    </form>
  );
}

export function FxRateForm({ csrf, defaultDate }: { csrf: string; defaultDate: string }) {
  return (
    <FormCard
      action={createFxRateAction}
      title="Add a rate"
      description="Save one direction. The other direction is calculated from it, so the two cannot disagree."
      className="mt-4 md:grid-cols-2"
    >
      <input type="hidden" name="csrf" value={csrf} />
      <Field label="Base">
        <Input name="baseCurrency" required maxLength={3} defaultValue="MYR" className="uppercase" />
      </Field>
      <Field label="Quote">
        <Input name="quoteCurrency" required maxLength={3} defaultValue="SGD" className="uppercase" />
      </Field>
      <Field label="Rate (quote per 1 base)">
        <Input name="rate" required inputMode="decimal" placeholder="0.3000" />
      </Field>
      <Field label="As of">
        <Input name="asOf" type="date" required defaultValue={defaultDate} />
      </Field>
      <Field label="Note" className="md:col-span-2">
        <Input name="note" required maxLength={300} />
      </Field>
      <div className="md:col-span-2">
        <SubmitButton>Save rate</SubmitButton>
      </div>
    </FormCard>
  );
}
