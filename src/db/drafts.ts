/**
 * The approval workflow. A journal is written as a draft (editable, invisible to
 * reports), submitted to pending, then approved — which inserts the immutable
 * posted entry and marks the draft posted. Posted books stay immutable; a wrong
 * posted entry is still corrected by a reversal, not an edit.
 */
import { and, desc, eq } from "drizzle-orm";
import { blocksSelfApproval } from "@/auth/roles";
import { getDb } from "./client";
import { assertPeriodOpen } from "./period-locks";
import {
  accounts,
  assets,
  auditEvents,
  journalDraftLines,
  journalDrafts,
  journalEntries,
  journalLines,
} from "./schema";

export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}

export type DraftStatus = "draft" | "pending" | "posted";

export interface DraftRow {
  id: string;
  entityId: string;
  reference: string;
  entryDate: string;
  memo: string;
  currency: string;
  debitMinor: bigint;
  creditMinor: bigint;
  status: DraftStatus;
  preparedBy: string;
  postedEntryId: string | null;
}

export interface DraftLineInput {
  accountCode: string;
  side: "debit" | "credit";
  amountMinor: bigint;
  currency: string;
  assetCode?: string;
  quantityMinor?: bigint;
  quantityDirection?: "in" | "out";
  sourceId?: string;
  memo?: string;
}

export interface NewDraftInput {
  entityId: string;
  reference: string;
  entryDate: string;
  memo: string;
  currency: string;
  lines: DraftLineInput[];
  preparedBy: string;
  actor: string;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function audit(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  organizationId: string,
  actor: string,
  action: string,
  subjectId: string,
  detail: string,
): Promise<void> {
  await tx.insert(auditEvents).values({
    id: newId("audit"),
    organizationId,
    occurredAt: new Date(),
    actor,
    action,
    subjectType: "journal_draft",
    subjectId,
    detail,
  });
}

/** Resolve account and asset codes to ids for a draft, failing on unknowns. */
async function resolveLines(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], organizationId: string, entityId: string, lines: readonly DraftLineInput[]) {
  const accountRows = await tx.select().from(accounts).where(eq(accounts.organizationId, organizationId));
  const accountId = new Map(accountRows.map((row) => [`${row.entityId}:${row.code}`, row.id]));
  const assetRows = await tx.select().from(assets).where(eq(assets.organizationId, organizationId));
  const assetId = new Map(assetRows.map((row) => [row.code, row.id]));
  return lines.map((line) => {
    const resolvedAccount = accountId.get(`${entityId}:${line.accountCode}`);
    if (!resolvedAccount) throw new DraftError(`Account ${line.accountCode} is not on this company.`);
    let resolvedAsset: string | null = null;
    if (line.assetCode) {
      resolvedAsset = assetId.get(line.assetCode) ?? null;
      if (!resolvedAsset) throw new DraftError(`Unknown asset ${line.assetCode}.`);
    }
    return {
      accountId: resolvedAccount,
      side: line.side,
      amountMinor: line.amountMinor,
      currency: line.currency,
      assetId: resolvedAsset,
      quantityMinor: line.quantityMinor ?? null,
      quantityDirection: line.quantityDirection ?? null,
      sourceId: line.sourceId ?? null,
      memo: line.memo ?? null,
    };
  });
}

/** Create a draft. It is invisible to reports until it is approved. */
export async function createDraft(organizationId: string, input: NewDraftInput): Promise<string> {
  const debitMinor = input.lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + line.amountMinor, 0n);
  const creditMinor = input.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + line.amountMinor, 0n);
  if (input.lines.length < 2) throw new DraftError("A journal needs at least two lines.");
  if (debitMinor !== creditMinor || debitMinor <= 0n) throw new DraftError("A journal must balance before it can be saved.");
  const db = getDb();
  const id = newId("draft");
  await db.transaction(async (tx) => {
    await tx.insert(journalDrafts).values({
      id,
      organizationId,
      entityId: input.entityId,
      reference: input.reference,
      entryDate: input.entryDate,
      memo: input.memo,
      currency: input.currency,
      debitMinor,
      creditMinor,
      status: "draft",
      preparedBy: input.preparedBy,
    });
    const resolved = await resolveLines(tx, organizationId, input.entityId, input.lines);
    await tx.insert(journalDraftLines).values(
      resolved.map((line, index) => ({ id: newId("dline"), organizationId, draftId: id, lineNumber: index + 1, ...line })),
    );
    await audit(tx, organizationId, input.actor, "journal.draft_created", id, `${input.reference} · draft`);
  });
  return id;
}

/** Submit a draft for approval. Only a draft can move to pending. */
export async function submitDraft(organizationId: string, draftId: string, actor: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const draft = (await tx.select().from(journalDrafts).where(and(eq(journalDrafts.id, draftId), eq(journalDrafts.organizationId, organizationId))).limit(1))[0];
    if (!draft) throw new DraftError("That draft does not exist.");
    if (draft.status !== "draft") throw new DraftError("Only a draft can be submitted for approval.");
    await tx.update(journalDrafts).set({ status: "pending", submittedAt: new Date() }).where(eq(journalDrafts.id, draftId));
    await audit(tx, organizationId, actor, "journal.draft_submitted", draftId, `${draft.reference} · pending approval`);
  });
}

/**
 * Approve a pending draft: insert the immutable posted entry and mark the draft
 * posted. Segregation of duties blocks an approver who is also the preparer
 * unless an owner supplies an override note.
 */
export async function approveDraft(input: {
  organizationId: string;
  draftId: string;
  approverActor: string;
  approverRole: "owner" | "admin" | "accountant" | "approver" | "viewer";
  overrideNote?: string | null;
}): Promise<string> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const draft = (await tx.select().from(journalDrafts).where(and(eq(journalDrafts.id, input.draftId), eq(journalDrafts.organizationId, input.organizationId))).limit(1))[0];
    if (!draft) throw new DraftError("That draft does not exist.");
    if (draft.status !== "pending") throw new DraftError("Only a pending draft can be approved.");
    if (draft.postedEntryId) throw new DraftError("That draft is already posted.");
    await assertPeriodOpen(input.organizationId, draft.entityId, draft.entryDate);
    const selfApproval = blocksSelfApproval(draft.preparedBy, input.approverActor, input.overrideNote ?? null);
    if (selfApproval) throw new DraftError("The preparer cannot approve their own entry without an owner's override note.");
    if (input.overrideNote && input.approverRole !== "owner") {
      throw new DraftError("Only an owner can override segregation of duties.");
    }

    const lines = await tx.select().from(journalDraftLines).where(eq(journalDraftLines.draftId, draft.id)).orderBy(journalDraftLines.lineNumber);
    const entryId = newId("je");
    await tx.insert(journalEntries).values({
      id: entryId,
      organizationId: input.organizationId,
      entityId: draft.entityId,
      reference: draft.reference,
      entryDate: draft.entryDate,
      memo: draft.memo,
      currency: draft.currency,
      debitMinor: draft.debitMinor,
      creditMinor: draft.creditMinor,
      postedAt: new Date(),
      postedBy: input.approverActor,
      reversesEntryId: null,
    });
    await tx.insert(journalLines).values(
      lines.map((line) => ({
        id: `${entryId}:${line.lineNumber}`,
        organizationId: input.organizationId,
        entryId,
        lineNumber: line.lineNumber,
        accountId: line.accountId,
        side: line.side,
        amountMinor: line.amountMinor,
        currency: line.currency,
        quantityMinor: line.quantityMinor,
        quantityDirection: line.quantityDirection,
        assetId: line.assetId,
        sourceId: line.sourceId,
        memo: line.memo,
      })),
    );
    await tx.update(journalDrafts).set({ status: "posted", postedEntryId: entryId }).where(eq(journalDrafts.id, draft.id));
    await audit(
      tx,
      input.organizationId,
      input.approverActor,
      "journal.draft_approved",
      draft.id,
      `${draft.reference} approved and posted${input.overrideNote ? ` (owner override: ${input.overrideNote})` : ""}`,
    );
    return entryId;
  });
}

function toDraftRow(row: typeof journalDrafts.$inferSelect): DraftRow {
  return {
    id: row.id,
    entityId: row.entityId,
    reference: row.reference,
    entryDate: row.entryDate,
    memo: row.memo,
    currency: row.currency,
    debitMinor: row.debitMinor,
    creditMinor: row.creditMinor,
    status: row.status,
    preparedBy: row.preparedBy,
    postedEntryId: row.postedEntryId,
  };
}

/**
 * Drafts that still need attention: a `draft` awaits submission, a `pending`
 * awaits approval. Posted drafts drop off the list; the immutable entry remains.
 */
export async function listOpenDrafts(organizationId: string): Promise<DraftRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(journalDrafts)
    .where(and(eq(journalDrafts.organizationId, organizationId)))
    .orderBy(desc(journalDrafts.createdAt));
  return rows.filter((row) => row.status !== "posted").map(toDraftRow);
}

/** Drafts awaiting approval, newest first. */
export async function listPendingDrafts(organizationId: string): Promise<DraftRow[]> {
  const rows = await listOpenDrafts(organizationId);
  return rows.filter((row) => row.status === "pending");
}
