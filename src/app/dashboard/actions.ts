"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BooksWriteError, insertEntity, insertJournal, insertReversal, insertSource, insertSourceTransactions } from "@/db/write";
import { booksAreWritable, loadBooks } from "@/data/load-books";
import { postFormJournal } from "@/data/journal-form";
import { parseSourceTransactionCsv } from "@/data/source-csv";
import {
  entityFormSchema,
  firstIssue,
  journalFormSchema,
  reversalFormSchema,
  sourceFormSchema,
} from "@/data/validate";
import { LedgerError } from "@/ledger";

export async function createEntityAction(formData: FormData) {
  const path = "/dashboard/entities";
  const books = await writableBooks(path);
  const parsed = entityFormSchema.safeParse({
    name: formData.get("name"),
    jurisdiction: String(formData.get("jurisdiction") ?? "").toUpperCase(),
    functionalCurrency: formData.get("functionalCurrency"),
    reportingFramework: formData.get("reportingFramework"),
    parentEntityId: formData.get("parentEntityId"),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  const actor = actorFrom(formData);
  if (!actor) fail(path, "Recorded by is required.");
  await save(path, () => insertEntity(books, parsed.data, actor));
  finish(path, "Entity recorded. A standard chart of accounts was added with it.");
}

export async function createSourceAction(formData: FormData) {
  const path = "/dashboard/sources";
  const books = await writableBooks(path);
  const parsed = sourceFormSchema.safeParse({
    entityId: formData.get("entityId"),
    kind: formData.get("kind"),
    role: formData.get("role") ?? "",
    name: formData.get("name"),
    chain: formData.get("chain") ?? "",
    identifier: formData.get("identifier"),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  const actor = actorFrom(formData);
  if (!actor) fail(path, "Recorded by is required.");
  await save(path, () => insertSource(books, parsed.data, actor));
  finish(path, "Source recorded.");
}

export async function importCsvAction(formData: FormData) {
  const path = "/dashboard/sources";
  const books = await writableBooks(path);
  const actor = actorFrom(formData);
  if (!actor) fail(path, "Recorded by is required.");
  const sourceId = String(formData.get("sourceId") ?? "");
  const text = await csvText(formData);
  const parsed = parseSourceTransactionCsv(text, books.assets);
  if (!parsed.ok) fail(path, parsed.errors[0] ?? "CSV could not be read.");
  await save(path, async () => {
    const count = await insertSourceTransactions(books, sourceId, parsed.rows, actor);
    return count;
  });
  finish(path, "Source transactions imported. Reconciliation on the next load uses these facts.");
}

export async function postJournalAction(formData: FormData) {
  const path = "/dashboard/ledger";
  const books = await writableBooks(path);
  const parsed = journalFormSchema.safeParse({
    entityId: formData.get("entityId"),
    reference: formData.get("reference"),
    entryDate: formData.get("entryDate"),
    memo: formData.get("memo"),
    postedBy: formData.get("postedBy"),
    lines: linesFromForm(formData),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  await save(path, async () => {
    const entry = postFormJournal(parsed.data, books);
    await insertJournal(books, entry, parsed.data.postedBy);
  });
  finish(path, "Journal posted. Posted entries are not edited; reverse one if it is wrong.");
}

export async function reverseJournalAction(formData: FormData) {
  const path = "/dashboard/ledger";
  const books = await writableBooks(path);
  const parsed = reversalFormSchema.safeParse({
    entryId: formData.get("entryId"),
    reference: formData.get("reference"),
    entryDate: formData.get("entryDate"),
    memo: formData.get("memo"),
    postedBy: formData.get("postedBy"),
  });
  if (!parsed.success) fail(path, firstIssue(parsed.error));
  await save(path, () =>
    insertReversal(books, parsed.data.entryId, {
      reference: parsed.data.reference,
      entryDate: parsed.data.entryDate,
      memo: parsed.data.memo,
    }, parsed.data.postedBy),
  );
  finish(path, "Reversal posted. The original entry is unchanged.");
}

async function writableBooks(path: string) {
  if (!booksAreWritable()) {
    fail(path, "Set DATABASE_URL to record books. The example books shown without a database are read-only.");
  }
  return loadBooks();
}

function linesFromForm(formData: FormData) {
  const lines = [];
  for (let index = 0; index < 4; index += 1) {
    const accountCode = String(formData.get(`line${index}_account`) ?? "").trim();
    const amount = String(formData.get(`line${index}_amount`) ?? "").trim();
    if (!accountCode && !amount) continue;
    lines.push({
      accountCode,
      side: String(formData.get(`line${index}_side`) ?? ""),
      amount,
      assetCode: String(formData.get(`line${index}_asset`) ?? ""),
      quantity: String(formData.get(`line${index}_quantity`) ?? ""),
      quantityDirection: String(formData.get(`line${index}_direction`) ?? ""),
      sourceId: String(formData.get(`line${index}_source`) ?? ""),
    });
  }
  return lines;
}

async function csvText(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) return file.text();
  return String(formData.get("csv") ?? "");
}

function actorFrom(formData: FormData): string {
  return String(formData.get("recordedBy") ?? formData.get("postedBy") ?? "").trim();
}

async function save(path: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    fail(path, safeMessage(error));
  }
}

function finish(path: string, message: string): never {
  revalidatePath("/dashboard", "layout");
  redirect(`${path}?saved=${encodeURIComponent(message)}`);
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function safeMessage(error: unknown): string {
  if (error instanceof LedgerError || error instanceof BooksWriteError) return error.message;
  if (hasCode(error, "23505")) return "That reference or identifier is already in use.";
  return "Could not save the record.";
}

function hasCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  if ("cause" in error) return hasCode(error.cause, code);
  return false;
}
