import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * The assistant's text-to-speech plays a `blob:` MP3 URL, and dictation uses the
 * microphone. Both need explicit policy: a `blob:` audio URL is blocked unless
 * CSP allows it, and `microphone=()` in Permissions-Policy blocks dictation.
 * This guards the two directives so a future edit cannot silently break voice.
 */
async function securityHeaders(): Promise<Record<string, string>> {
  const rules = await nextConfig.headers!();
  const rule = rules.find((entry) => entry.source === "/:path*")!;
  return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
}

describe("security headers", () => {
  it("allows blob: media so assistant speech can play", async () => {
    const headers = await securityHeaders();
    expect(headers["Content-Security-Policy"]).toContain("media-src 'self' blob:");
  });

  it("allows the microphone for dictation", async () => {
    const headers = await securityHeaders();
    expect(headers["Permissions-Policy"]).toContain("microphone=(self)");
  });

  it("allows Google Tag Manager to load and send", async () => {
    const headers = await securityHeaders();
    const csp = headers["Content-Security-Policy"];
    expect(csp).toContain("https://www.googletagmanager.com");
    // The GTM noscript fallback is an iframe of its own page.
    expect(csp).toContain("frame-src https://www.googletagmanager.com");
    // GA4, which GTM commonly injects.
    expect(csp).toContain("https://www.google-analytics.com");
  });
});
