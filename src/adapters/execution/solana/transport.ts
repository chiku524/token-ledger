/**
 * The real transport for a configured deployment. Kept separate from the
 * boundary so the boundary stays transport-agnostic and testable. Returns null
 * when the deployment has no RPC URL, so callers show "contract features are off"
 * rather than fail.
 */
import type { SolanaDeployment } from "@/config/solana";
import { RpcSolanaTransport } from "./rpc-transport";
import type { SolanaTransport } from "./types";

export function contractTransport(deployment: SolanaDeployment): SolanaTransport {
  return new RpcSolanaTransport({ url: deployment.rpcUrl, cluster: deployment.cluster });
}
