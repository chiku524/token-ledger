import type { NextConfig } from "next";

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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
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
