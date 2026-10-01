/**
 * The scheduled sync pass. Vercel Cron calls this on the interval in
 * `vercel.json`; it can also be called by any scheduler with the bearer token.
 * It pulls every due connection across every organization and records each run.
 * Read-only: it never posts a journal.
 *
 * Auth: when CRON_SECRET is set, the request must carry
 * `Authorization: Bearer <CRON_SECRET>` (Vercel sends this automatically).
 * Without a database the pass is a no-op.
 */
import { readCronSecret } from "@/env";
import { runDueSyncsForAllOrganizations } from "@/data/run-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = readCronSecret();
  if (secret) {
    const provided = request.headers.get("authorization");
    if (provided !== `Bearer ${secret}`) {
      return Response.json({ status: "unauthorized" }, { status: 401 });
    }
  }

  const summary = await runDueSyncsForAllOrganizations();
  return Response.json({ status: "ok", ...summary });
}
