import { afterEach, describe, expect, it } from "vitest";
import { connectExchanges } from "./connect-catalog";

const ENV_KEYS = [
  "COINBASE_CLIENT_ID",
  "COINBASE_CLIENT_SECRET",
  "BYBIT_OAUTH_CLIENT_ID",
  "BYBIT_OAUTH_CLIENT_SECRET",
  "GEMINI_CLIENT_ID",
  "GEMINI_CLIENT_SECRET",
] as const;

const previous = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (previous.has(key)) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      previous.delete(key);
    }
  }
});

function stashEnv() {
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
}

describe("connectExchanges", () => {
  it("marks Coinbase OAuth not ready and defaults to the API tab when client env is unset", () => {
    stashEnv();
    const coinbase = connectExchanges().find((item) => item.key === "coinbase");
    expect(coinbase).toMatchObject({
      oauth: true,
      oauthReady: false,
      defaultTab: "api",
    });
  });

  it("opens Coinbase on OAuth when the client id and secret are set", () => {
    stashEnv();
    process.env.COINBASE_CLIENT_ID = "cb-id";
    process.env.COINBASE_CLIENT_SECRET = "cb-secret";
    const coinbase = connectExchanges().find((item) => item.key === "coinbase");
    expect(coinbase).toMatchObject({
      oauth: true,
      oauthReady: true,
      defaultTab: "oauth",
    });
  });
});
