import { describe, expect, it } from "vitest";
import { InMemorySolanaTransport } from "@/adapters/execution/solana/in-memory-transport";
import { runSigningFlow, type SigningFlow } from "./signing-flow";

function flow(
  transport: InMemorySolanaTransport,
  overrides: Partial<SigningFlow<string>> = {},
): SigningFlow<string> {
  return {
    transport,
    getLatestBlockhash: async () => ({ blockhash: "hash", lastValidBlockHeight: 100 }),
    assemble: async () => ({ transaction: "unsigned", messageBase64: "msg" }),
    sign: async () => "signed",
    poll: { attempts: 3, intervalMs: 0 },
    sleep: async () => {},
    ...overrides,
  };
}

describe("runSigningFlow", () => {
  it("finalizes when the cluster reports a finalized slot", async () => {
    const transport = new InMemorySolanaTransport("devnet", {
      confirmations: { sig1: { signature: "sig1", status: "finalized", slot: 5 } },
      signatures: ["sig1"],
    });
    await expect(runSigningFlow(flow(transport))).resolves.toEqual({ status: "finalized", signature: "sig1" });
  });

  it("never sends when the simulation reverts", async () => {
    const transport = new InMemorySolanaTransport("devnet", {
      simulations: [{ ok: false, logs: ["Program log: fail"], error: "Custom(1)" }],
    });
    const outcome = await runSigningFlow(flow(transport));
    expect(outcome.status).toBe("simulation_failed");
  });

  it("reports failed when the transaction fails on-chain", async () => {
    const transport = new InMemorySolanaTransport("devnet", {
      signatures: ["sig2"],
      confirmations: { sig2: { signature: "sig2", status: "failed", error: "Bad" } },
    });
    const outcome = await runSigningFlow(flow(transport));
    expect(outcome).toMatchObject({ status: "failed", signature: "sig2" });
  });

  it("returns submitted, not finalized, when only confirmed within the budget", async () => {
    const transport = new InMemorySolanaTransport("devnet", {
      signatures: ["sig3"],
      confirmations: { sig3: { signature: "sig3", status: "confirmed", slot: 7 } },
    });
    const outcome = await runSigningFlow(flow(transport));
    expect(outcome).toMatchObject({ status: "submitted", signature: "sig3" });
  });

  it("surfaces an error when the wallet refuses", async () => {
    const transport = new InMemorySolanaTransport("devnet");
    const outcome = await runSigningFlow(
      flow(transport, {
        sign: async () => {
          throw new Error("User rejected the request.");
        },
      }),
    );
    expect(outcome).toEqual({ status: "error", message: "User rejected the request." });
  });
});
