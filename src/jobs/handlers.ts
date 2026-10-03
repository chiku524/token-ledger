/**
 * The registered job handlers. Each kind maps to a function that performs the
 * work through the execution boundary and returns whether to retry. Keeping the
 * handlers here (not inline in the worker) lets the runner stay transport- and
 * domain-agnostic, and lets the handler set be extended without touching the
 * worker.
 *
 * Handlers are registered with the real boundary at wiring time; this module
 * exports the map factory so a route can build it once per request.
 */
import type { ExecutionBoundary, SignedTransaction } from "@/adapters/execution/solana";
import type { JobHandler, JobResult } from "./runner";

export interface HandlerDependencies {
  boundary: ExecutionBoundary;
  /**
   * Build and sign a transaction for a job. This is where the app applies the
   * prepare/approve rules; the worker only retries. Signing uses the customer's
   * wallet in the browser path, or a relayer for an already-eligible action.
   */
  signAndSubmit: (jobKind: string, payload: Record<string, unknown>) => Promise<SignedTransaction>;
  /** Confirm the signature is settled; the handler gates the projection on this. */
  projectSettlement: (jobKind: string, payload: Record<string, unknown>, signature: string) => Promise<void>;
}

/** The job kinds the worker knows about. */
export const JOB_KINDS = ["billing.collect", "treasury.execute"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/**
 * A handler that submits one transaction and, only once it is finalized,
 * projects the settlement. The submit step throws a retryable error on an RPC
 * hiccup and a non-retryable one on a program revert, so the runner's policy
 * does the right thing.
 */
function submitHandler(deps: HandlerDependencies): JobHandler {
  return async ({ job }): Promise<JobResult> => {
    const signed = await deps.signAndSubmit(job.kind, job.payload);
    const signature = await deps.boundary.submit(signed);
    const finalized = await deps.boundary.isFinalized(signature);
    if (!finalized) {
      return { ok: false, retryable: true, message: "not finalized yet; will re-check" };
    }
    await deps.projectSettlement(job.kind, job.payload, signature);
    return { ok: true };
  };
}

/** Build the handler map the worker runs. */
export function buildHandlers(deps: HandlerDependencies): Record<string, JobHandler> {
  const handler = submitHandler(deps);
  return {
    "billing.collect": handler,
    "treasury.execute": handler,
  };
}
