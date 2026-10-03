/**
 * The durable worker. It drains the outbox each pass: claim due jobs, run the
 * handler, and either complete the job or reschedule it with backoff. It never
 * runs the same job twice (a lease), and a job whose lease expired is retried.
 *
 * A handler is registered per job kind. The worker is transport-agnostic: a
 * handler receives the job and returns a result; the settlement/boundary calls
 * happen inside the handler, not here. This keeps the retry and lease logic
 * pure and testable.
 */
import { ExecutionBoundary, type SolanaTransport } from "@/adapters/execution/solana";
import { claimJobs, completeJob, failJob, type JobRow } from "@/db/outbox";
import { decideAttempt, type AttemptOutcome } from "./outbox";

export interface JobContext {
  job: JobRow;
  /** The worker's identity, for logging. */
  workerId: string;
}

export interface JobResult {
  ok: boolean;
  /** Whether a failure is worth retrying (an RPC hiccup) or terminal (a revert). */
  retryable?: boolean;
  /** The failure was a blockhash expiry, so state must be re-checked first. */
  blockhashExpired?: boolean;
  message?: string;
}

export type JobHandler = (context: JobContext) => Promise<JobResult>;

export interface WorkerOptions {
  workerId: string;
  limit?: number;
  handlers: Record<string, JobHandler>;
  /** A clock, injected for tests. */
  now?: () => Date;
}

export interface WorkerPassSummary {
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
  skipped: number;
}

/**
 * Run one pass. Claim up to `limit` jobs and process each. A job with no
 * registered handler is left untouched (skipped), not failed, so a new kind can
 * ship before its handler.
 */
export async function runWorkerPass(options: WorkerOptions): Promise<WorkerPassSummary> {
  const now = options.now ?? (() => new Date());
  const claimed = await claimJobs(options.workerId, options.limit ?? 5, now());
  const summary: WorkerPassSummary = { claimed: claimed.length, completed: 0, failed: 0, dead: 0, skipped: 0 };

  for (const job of claimed) {
    const handler = options.handlers[job.kind];
    if (!handler) {
      summary.skipped += 1;
      continue;
    }
    let result: JobResult;
    try {
      result = await handler({ job, workerId: options.workerId });
    } catch (error) {
      result = { ok: false, retryable: true, message: error instanceof Error ? error.message : "handler threw" };
    }

    if (result.ok) {
      await completeJob(job.id);
      summary.completed += 1;
      continue;
    }

    const decision = decideAttempt({
      attempts: job.attempts + 1,
      retryable: result.retryable ?? true,
      blockhashExpired: result.blockhashExpired,
    });
    const outcome: Exclude<AttemptOutcome, "done"> = decision.outcome === "dead" ? "dead" : "retry";
    await failJob(job.id, outcome, result.message ?? "failed", now());
    if (outcome === "dead") summary.dead += 1;
    else summary.failed += 1;
  }

  return summary;
}

/** Build a Solana transport for a pass, given the configured cluster/deployment. */
export type JobTransportFactory = (deployment: { cluster: string; rpcUrl: string }) => SolanaTransport;

export interface WorkerBatchOptions {
  workerId: string;
  limit?: number;
  buildHandlers: (boundary: ExecutionBoundary) => Record<string, JobHandler>;
  transportFactory: JobTransportFactory;
  deployment?: { cluster: string; rpcUrl: string };
  now?: () => Date;
}

/**
 * A full pass with a real boundary: build the transport, wire the handlers, and
 * run the loop. The route calls this once per invocation; the transport and
 * handler set are constructed per pass, so a request never shares a transport.
 */
export async function runWorkerBatch(options: WorkerBatchOptions): Promise<WorkerPassSummary> {
  const deployment = options.deployment ?? { cluster: "devnet", rpcUrl: "https://api.devnet.solana.com" };
  const boundary = new ExecutionBoundary(options.transportFactory(deployment));
  const handlers = options.buildHandlers(boundary);
  return runWorkerPass({ workerId: options.workerId, limit: options.limit, handlers, now: options.now });
}
