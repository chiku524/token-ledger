/**
 * The contract worker pass. A scheduler calls this frequently (the plan targets
 * each minute); it drains a bounded slice of the outbox. Auth matches the sync
 * cron: bearer `CRON_SECRET` when set. Without a database, a configured
 * deployment, or a wired transport it is a no-op that says why, rather than
 * pretending to run.
 *
 * `maxDuration` bounds the pass; a scheduler calls again for the next slice.
 */
import { solanaDeployment } from "@/config/solana";
import { hasDatabase } from "@/db/availability";
import { buildHandlers } from "@/jobs/handlers";
import { runWorkerBatch, type JobTransportFactory } from "@/jobs/runner";
import { readCronSecret } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(request: Request): Response | null {
  const secret = readCronSecret();
  if (!secret) return null;
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = unauthorized(request);
  if (denied) return denied;

  if (!hasDatabase()) return Response.json({ status: "ok", skipped: "no database" });
  const deployment = solanaDeployment();
  if (!deployment) return Response.json({ status: "ok", skipped: "contracts not configured" });

  // A real Solana transport is not wired yet (see the ADR: the RPC client is
  // deferred until the execution endpoints are built). Until then the pass has
  // nothing to submit, so it reports that instead of running a fake boundary.
  const transportFactory: JobTransportFactory | null = null;
  if (!transportFactory) {
    return Response.json({ status: "ok", skipped: "execution transport not wired" });
  }

  try {
    const summary = await runWorkerBatch({
      workerId: `worker_${crypto.randomUUID()}`,
      limit: 5,
      buildHandlers: (boundary) =>
        buildHandlers({
          boundary,
          signAndSubmit: async () => {
            throw new Error("signing is not wired yet");
          },
          projectSettlement: async () => {},
        }),
      transportFactory,
    });
    return Response.json({ status: "ok", ...summary });
  } catch (error) {
    return Response.json(
      { status: "error", message: error instanceof Error ? error.message : "worker pass failed" },
      { status: 500 },
    );
  }
}
