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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              previewToolbar
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              previewToolbar ? "style-src 'self' 'unsafe-inline' https://vercel.live" : "style-src 'self' 'unsafe-inline'",
              previewToolbar ? "img-src 'self' data: blob: https://vercel.com https://vercel.live" : "img-src 'self' data:",
              "font-src 'self' data:",
              previewToolbar ? "connect-src 'self' https://vercel.live wss://ws-us3.pusher.com" : "connect-src 'self'",
              "frame-ancestors 'none'",
              ...(previewToolbar ? ["frame-src https://vercel.live"] : []),
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
