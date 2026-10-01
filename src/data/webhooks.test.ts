import { describe, expect, it } from "vitest";
import {
  deriveSourceSecret,
  eventFingerprint,
  normalizeWebhookEvent,
  signWebhook,
  verifyWebhookSignature,
  WebhookError,
  WEBHOOK_MAX_AGE_MS,
} from "./webhooks";

const SECRET = "s".repeat(32);
const ASSETS = [
  { code: "ETH", decimals: 18 },
  { code: "USDC", decimals: 6 },
];

describe("verifyWebhookSignature", () => {
  const now = Date.UTC(2026, 5, 1, 12, 0, 0);
  const timestamp = Math.floor(now / 1000);
  const body = JSON.stringify({ sourceId: "src_1", externalId: "evt-1" });

  it("accepts a signature it produced", () => {
    const header = signWebhook(body, SECRET, timestamp);
    expect(() => verifyWebhookSignature({ rawBody: body, header, secret: SECRET, now })).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const header = signWebhook(body, SECRET, timestamp);
    expect(() => verifyWebhookSignature({ rawBody: `${body} `, header, secret: SECRET, now })).toThrow(WebhookError);
  });

  it("rejects the wrong secret", () => {
    const header = signWebhook(body, SECRET, timestamp);
    expect(() => verifyWebhookSignature({ rawBody: body, header, secret: "x".repeat(32), now })).toThrow(/match/i);
  });

  it("rejects a stale timestamp to bound replay", () => {
    const old = timestamp - Math.ceil(WEBHOOK_MAX_AGE_MS / 1000) - 1;
    const header = signWebhook(body, SECRET, old);
    expect(() => verifyWebhookSignature({ rawBody: body, header, secret: SECRET, now })).toThrow(/window/i);
  });

  it("rejects a missing or malformed header", () => {
    expect(() => verifyWebhookSignature({ rawBody: body, header: null, secret: SECRET, now })).toThrow(/missing/i);
    expect(() => verifyWebhookSignature({ rawBody: body, header: "nonsense", secret: SECRET, now })).toThrow(/malformed/i);
  });
});

describe("deriveSourceSecret", () => {
  it("is deterministic and differs per source", () => {
    expect(deriveSourceSecret(SECRET, "src_1")).toBe(deriveSourceSecret(SECRET, "src_1"));
    expect(deriveSourceSecret(SECRET, "src_1")).not.toBe(deriveSourceSecret(SECRET, "src_2"));
  });
});

describe("normalizeWebhookEvent", () => {
  const base = {
    sourceId: "src_1",
    externalId: "evt-1",
    occurredOn: "2026-06-01",
    assetCode: "USDC",
    direction: "in",
    quantity: "12.5",
  };

  it("converts the quantity to minor units with the asset scale", () => {
    const event = normalizeWebhookEvent(base, ASSETS);
    expect(event.quantityMinor).toBe(12_500_000n);
    expect(event.description).toBe("Source event");
  });

  it("rejects an unknown asset, a bad date, a bad direction, and a bad quantity", () => {
    expect(() => normalizeWebhookEvent({ ...base, assetCode: "DOGE" }, ASSETS)).toThrow(/unknown asset/i);
    expect(() => normalizeWebhookEvent({ ...base, occurredOn: "yesterday" }, ASSETS)).toThrow(/occurredOn/i);
    expect(() => normalizeWebhookEvent({ ...base, direction: "sideways" }, ASSETS)).toThrow(/direction/i);
    expect(() => normalizeWebhookEvent({ ...base, quantity: "not-a-number" }, ASSETS)).toThrow(WebhookError);
  });

  it("rejects a missing field", () => {
    expect(() => normalizeWebhookEvent({ ...base, externalId: "" }, ASSETS)).toThrow(/externalId/i);
  });
});

describe("eventFingerprint", () => {
  it("is stable for the same event and changes with the payload", () => {
    const first = normalizeWebhookEvent(
      { sourceId: "s", externalId: "e", occurredOn: "2026-06-01", assetCode: "ETH", direction: "in", quantity: "1" },
      ASSETS,
    );
    const second = normalizeWebhookEvent(
      { sourceId: "s", externalId: "e", occurredOn: "2026-06-01", assetCode: "ETH", direction: "in", quantity: "1" },
      ASSETS,
    );
    expect(eventFingerprint(first)).toBe(eventFingerprint(second));
    expect(eventFingerprint({ ...first, quantity: "2" })).not.toBe(eventFingerprint(first));
  });
});
