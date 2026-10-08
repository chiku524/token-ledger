import type { NextConfig } from "next";

const previewToolbar = process.env.VERCEL_ENV === "preview";

const nextConfig: NextConfig = {
  // A self-contained server image is only needed for a container host (see
  // docs/adr-container-deployment.md). Left off unless DEPLOY_TARGET=container,
  // so the Vercel build is unchanged.
  output: process.env.DEPLOY_TARGET === "container" ? "standalone" : undefined,
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // `microphone=(self)` so the assistant's dictation can use the mic; the
          // browser's speech recognition runs in this origin. Camera and
          // geolocation stay denied.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Google Tag Manager loads from googletagmanager.com and injects
              // tags (GA4, ads) from google-analytics.com and doubleclick.net.
              previewToolbar
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://vercel.live"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
              previewToolbar ? "style-src 'self' 'unsafe-inline' https://vercel.live" : "style-src 'self' 'unsafe-inline'",
              previewToolbar ? "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com https://vercel.com https://vercel.live" : "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com",
              "font-src 'self' data:",
              // The assistant's text-to-speech plays a `blob:` MP3 built from our
              // own /api/speech response.
              "media-src 'self' blob:",
              previewToolbar
                ? "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://vercel.live wss://ws-us3.pusher.com"
                : "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com",
              "frame-ancestors 'none'",
              // GTM's noscript fallback embeds its own page in an iframe.
              ...(previewToolbar ? ["frame-src https://www.googletagmanager.com https://vercel.live"] : ["frame-src https://www.googletagmanager.com"]),
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// Wire Cloudflare bindings (Hyperdrive) into `next dev` only when asked
// (CLOUDFLARE_DEV=1). The import is dynamic and the adapter is an optional
// devDependency, so the Vercel build never loads it.
if (process.env.CLOUDFLARE_DEV === "1") {
  void import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => initOpenNextCloudflareForDev());
}
