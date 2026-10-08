/**
 * The scheduled indexer pass. A scheduler calls this frequently; it advances the
 * chain cursor to finality for each configured program, records decoded events,
 * and projects entitlements for finalized mandates. Auth matches the sync cron:
 * bearer `CRON_SECRET` when set. Without a database or a configured deployment it
 * is a no-op that says why.
 */
import { readCronSecret } from "@/env";
import { backfillAllEmbeddings } from "@/ai/embeddings/backfill";
import { runIndexerPasses } from "@/indexer/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = readCronSecret();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }

  // Safety net: embed any assistant message that missed its insert-time embed.
  // Bounded and idempotent; a no-op when retrieval is off. Best-effort — a
  // failure here must not fail the indexer.
  let embeddings: { embedded: number; skipped: number; failed: number } | null = null;
  try {
    embeddings = await backfillAllEmbeddings();
  } catch {
    embeddings = null;
  }

  const summary = await runIndexerPasses();
  if (!summary) return Response.json({ status: "ok", skipped: "no database or contracts not configured", embeddings });
  return Response.json({ status: "ok", ...summary, embeddings });
}
