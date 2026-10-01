import { describe, expect, it, vi } from "vitest";
import { SolanaRpcClient, SolanaRpcError } from "./rpc";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

describe("SolanaRpcClient", () => {
  it("sends a JSON-RPC 2.0 POST and returns the result", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(init?.method).toBe("POST");
      expect(request).toMatchObject({ jsonrpc: "2.0", method: "getBalance" });
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: { value: 42 } });
    });

    const client = new SolanaRpcClient({ url: "https://example.com", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.call("getBalance", ["abc"])).resolves.toEqual({ value: 42 });
  });

  it("never uses a signing method", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.method).not.toBe("sendTransaction");
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: [] });
    });
    const client = new SolanaRpcClient({ url: "https://example.com", fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.call("getSignaturesForAddress", ["abc"]);
  });

  it("surfaces a JSON-RPC error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid param" } }),
    );
    const client = new SolanaRpcClient({ url: "https://example.com", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.call("getBalance", ["bad"])).rejects.toThrow(/Invalid param/);
    await expect(client.call("getBalance", ["bad"])).rejects.toBeInstanceOf(SolanaRpcError);
  });

  it("reports HTTP 429 with the retry hint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("too many requests", { status: 429, headers: { "retry-after": "2" } }),
    );
    const client = new SolanaRpcClient({ url: "https://example.com", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.call("getBalance", ["abc"])).rejects.toThrow(/HTTP 429.*Retry after 2s/);
  });

  it("times out a slow response", async () => {
    const fetchImpl = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    const client = new SolanaRpcClient({
      url: "https://example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
    });
    await expect(client.call("getBalance", ["abc"])).rejects.toThrow(/timed out/);
  });
});
