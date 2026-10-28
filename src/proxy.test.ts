import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_PATH_HEADER } from "@/data/me-paths";
import { proxy } from "./proxy";

// With a database configured, a dashboard page needs a real session cookie, not the demo sign-in.
beforeEach(() => vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test"));
afterEach(() => vi.unstubAllEnvs());

describe("the proxy", () => {
  const request = (path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) =>
    new NextRequest(`https://ledger.test${path}`, {
      headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    });
  const signedIn = "tl_session=abc";

  it("serves /me/holdings with the /dashboard/sources page and records the address asked for", () => {
    const response = proxy(request("/me/holdings?currency=SGD", { cookie: signedIn }));
    const rewrite = new URL(response.headers.get("x-middleware-rewrite") ?? "");
    expect(rewrite.pathname).toBe("/dashboard/sources");
    expect(rewrite.search).toBe("?currency=SGD");
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe("/me/holdings?currency=SGD");
  });

  it("never believes an address the client sent", () => {
    const response = proxy(request("/dashboard/sources", { cookie: signedIn, headers: { [REQUEST_PATH_HEADER]: "/me/anything" } }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe("/dashboard/sources");
  });

  it("asks a signed-out visitor to sign in, and brings them back to /me", () => {
    const response = proxy(request("/me/reports?tab=activity"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/me/reports?tab=activity");
  });

  it("does not rewrite other paths, including look-alikes of /me", () => {
    for (const path of ["/memo", "/measure", "/sign-in", "/"]) {
      expect(proxy(request(path)).headers.get("x-middleware-rewrite")).toBeNull();
    }
  });
});
