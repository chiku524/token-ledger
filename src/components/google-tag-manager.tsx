import { GoogleTagManager as NextGoogleTagManager } from "@next/third-parties/google";

/**
 * Google Tag Manager, via the official `@next/third-parties` component (see
 * https://nextjs.org/docs/app/guides/third-party-libraries). The container id is
 * a public, browser-safe value (visible in the page source by design), so it may
 * be committed. It is mounted in the root layout so every route is covered.
 *
 * GTM is a *container*: on its own it runs no analytics. A Google tag (`gtag.js`,
 * a `G-…` measurement id) or another vendor tag has to be added to the container
 * in the GTM UI and **published** — an empty container fires nothing, which is
 * why Google's checker reports no tag. To send events from the app, use
 * `sendGTMEvent` from the same package.
 *
 * GTM injects scripts from googletagmanager.com and google-analytics.com, so
 * those origins are allowed in the CSP (see `next.config.ts`) or the browser
 * blocks them.
 */
export const GTM_ID = "GTM-5VDW7C72";

export function GoogleTagManager() {
  return <NextGoogleTagManager gtmId={GTM_ID} />;
}


/** The noscript fallback, which Google's snippet places immediately after <body>. */
export function GoogleTagManagerNoScript() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
