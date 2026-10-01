import { describe, expect, it, vi } from "vitest";
import { evmChain } from "./chains";
import { EvmRpcClient, EvmRpcError, resolveEndpoint } from "./rpc";

const ethereum = evmChain("ethereum")!;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("resolveEndpoint", () => {
  it("prefers an explicit url, then Alchemy, then the public RPC", () => {
    expect(resolveEndpoint(ethereum, { url: "https://x.example.com" })).toBe("https://x.example.com");
    expect(resolveEndpoint(ethereum, { apiKey: "abc" })).toBe("https://eth-mainnet.g.alchemy.com/v2/abc");
    expect(resolveEndpoint(ethereum, { apiKey: null })).toBe(ethereum.publicRpcUrl);
  });
});

describe("EvmRpcClient", () => {
  it("POSTs JSON-RPC and returns the result", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request).toMatchObject({ jsonrpc: "2.0", method: "eth_getBalance" });
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: "0x1" });
    });
    const client = new EvmRpcClient(ethereum, { apiKey: null, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.call("eth_getBalance", ["0x0", "latest"])).resolves.toBe("0x1");
    expect(client.enhanced).toBe(false);
  });

  it("reports enhanced when pointed at Alchemy", () => {
    const client = new EvmRpcClient(ethereum, { apiKey: "k", fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(client.enhanced).toBe(true);
  });

  it("surfaces JSON-RPC and HTTP errors", async () => {
    const rpcError = vi.fn(async () => jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "boom" } }));
    await expect(
      new EvmRpcClient(ethereum, { apiKey: null, fetchImpl: rpcError as unknown as typeof fetch }).call("eth_getBalance", []),
    ).rejects.toBeInstanceOf(EvmRpcError);

    const httpError = vi.fn(async () => new Response("nope", { status: 429, headers: { "retry-after": "3" } }));
    await expect(
      new EvmRpcClient(ethereum, { apiKey: null, fetchImpl: httpError as unknown as typeof fetch }).call("eth_getBalance", []),
    ).rejects.toThrow(/HTTP 429.*Retry after 3s/);
  });

  it("times out a slow response", async () => {
    const slow = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    const client = new EvmRpcClient(ethereum, { apiKey: null, fetchImpl: slow as unknown as typeof fetch, timeoutMs: 5 });
    await expect(client.call("eth_getBalance", [])).rejects.toThrow(/timed out/);
  });
});
