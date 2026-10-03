import { describe, expect, it } from "vitest";
import { ExecutionBoundary } from "./boundary";
import { InMemorySolanaTransport } from "./in-memory-transport";

const CLUSTER = "devnet";

describe("ExecutionBoundary", () => {
  it("simulates without sending", async () => {
    const transport = new InMemorySolanaTransport(CLUSTER);
    const boundary = new ExecutionBoundary(transport);
    const result = await boundary.simulate({
      cluster: CLUSTER,
      messageBase64: "AA==",
      recentBlockhash: "hash",
      lastValidBlockHeight: 100,
      preview: { action: "billing.collect", feePayer: "payer", instructions: [] },
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a transaction targeting another cluster", async () => {
    const boundary = new ExecutionBoundary(new InMemorySolanaTransport(CLUSTER));
    await expect(
      boundary.simulate({
        cluster: "mainnet-beta",
        messageBase64: "AA==",
        recentBlockhash: "hash",
        lastValidBlockHeight: 100,
        preview: { action: "billing.collect", feePayer: "payer", instructions: [] },
      }),
    ).rejects.toThrow(/devnet|mainnet/i);
  });

  it("does not send a transaction that reverts in simulation", async () => {
    const transport = new InMemorySolanaTransport(CLUSTER, {
      simulations: [{ ok: false, logs: ["Program log: CapExceeded"], error: "custom program error: 0x1772" }],
    });
    const boundary = new ExecutionBoundary(transport);
    await expect(boundary.submit({ signature: "sig", wireTransactionBase64: "AA==" })).rejects.toThrow(
      /would revert/i,
    );
  });

  it("sends a valid transaction and returns its signature", async () => {
    const transport = new InMemorySolanaTransport(CLUSTER, { signatures: ["sig-abc"] });
    const boundary = new ExecutionBoundary(transport);
    const signature = await boundary.submit({ signature: "sig-abc", wireTransactionBase64: "AA==" });
    expect(signature).toBe("sig-abc");
  });

  it("treats only a finalized signature as settled", async () => {
    const transport = new InMemorySolanaTransport(CLUSTER, {
      confirmations: {
        finalized: { signature: "finalized", status: "finalized", slot: 42 },
        confirmed: { signature: "confirmed", status: "confirmed", slot: 42 },
      },
    });
    const boundary = new ExecutionBoundary(transport);
    expect(await boundary.isFinalized("finalized")).toBe(true);
    // A confirmed-but-not-finalized transaction is not settled, and an unknown
    // signature is not settled either.
    expect(await boundary.isFinalized("confirmed")).toBe(false);
    expect(await boundary.isFinalized("unknown")).toBe(false);
  });
});
