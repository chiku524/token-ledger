/**
 * Google Tag Manager container id. A public, browser-safe value (it appears in
 * the page source by design), so it may be committed.
 *
 * The snippet itself is rendered in `src/app/layout.tsx` with `next/script`,
 * `strategy="beforeInteractive"`, so it is emitted into the server-rendered
 * HTML. That strategy matters: with `afterInteractive` the snippet only ships in
 * the React data blob and is injected after hydration, so a tag checker reading
 * the raw HTML reports it as not installed.
 *
 * GTM injects its script and the tags inside the container from
 * googletagmanager.com and google-analytics.com; those origins are allowed in
 * the CSP (see `next.config.ts`) or the browser blocks them.
 */
export const GTM_ID = "GTM-5VDW7C72";
