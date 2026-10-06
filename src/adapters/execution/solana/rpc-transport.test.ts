import { describe, expect, it } from "vitest";
import { RpcSolanaTransport } from "./rpc-transport";

function rpc(result: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

function rpcError(error: { code: number; message: string }): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

function transport(fetchImpl: typeof fetch) {
  return new RpcSolanaTransport({ url: "https://rpc.test", cluster: "devnet", fetchImpl });
}

describe("RpcSolanaTransport", () => {
  it("reads the latest blockhash", async () => {
    const t = transport(rpc({ value: { blockhash: "abc", lastValidBlockHeight: 42 } }));
    await expect(t.getLatestBlockhash()).resolves.toEqual({ blockhash: "abc", lastValidBlockHeight: 42 });
  });

  it("reports a successful simulation", async () => {
    const t = transport(rpc({ value: { err: null, logs: ["Program log: ok"], unitsConsumed: 1234 } }));
    const result = await t.simulate("base64-tx");
    expect(result).toMatchObject({ ok: true, unitsConsumed: 1234 });
  });

  it("reports a reverted simulation without throwing", async () => {
    const t = transport(rpc({ value: { err: { InstructionError: [0, "Custom"] }, logs: ["boom"] } }));
    const result = await t.simulate("base64-tx");
    expect(result.ok).toBe(false);
    expect(result.logs).toEqual(["boom"]);
    expect(result.error).toContain("InstructionError");
  });

  it("sends a signed transaction and returns the signature", async () => {
    const t = transport(rpc("5SigBase58"));
    await expect(t.send("base64-tx")).resolves.toBe("5SigBase58");
  });

  it("maps confirmation status to the boundary vocabulary", async () => {
    const finalized = transport(rpc({ value: [{ confirmationStatus: "finalized", err: null, slot: 10 }] }));
    expect(await finalized.confirmationStatus("s")).toMatchObject({ status: "finalized", slot: 10 });

    const confirmed = transport(rpc({ value: [{ confirmationStatus: "confirmed", err: null, slot: 11 }] }));
    expect(await confirmed.confirmationStatus("s")).toMatchObject({ status: "confirmed" });

    const processed = transport(rpc({ value: [{ confirmationStatus: "processed", err: null, slot: 12 }] }));
    expect(await processed.confirmationStatus("s")).toMatchObject({ status: "confirmed" });

    const failed = transport(rpc({ value: [{ confirmationStatus: "finalized", err: { InstructionError: [0, "Custom"] }, slot: 13 }] }));
    expect(await failed.confirmationStatus("s")).toMatchObject({ status: "failed" });

    const unknown = transport(rpc({ value: [null] }));
    expect(await unknown.confirmationStatus("s")).toMatchObject({ status: "failed", error: "unknown signature" });
  });

  it("surfaces an RPC error response", async () => {
    const t = transport(rpcError({ code: -32602, message: "Invalid params" }));
    await expect(t.send("base64-tx")).rejects.toThrow(/Invalid params/);
  });

  it("surfaces a non-200 HTTP response", async () => {
    const t = transport(rpc({}, false));
    await expect(t.send("base64-tx")).rejects.toThrow(/HTTP 500/);
  });
});
