/**
 * Google Tag Manager. The container id is a public, browser-safe value (it is
 * visible in the page source by design), so it may be committed.
 *
 * The loader is a plain inline script rendered in the initial HTML — NOT
 * `next/script`, whose `afterInteractive` strategy injects it only after
 * hydration. Google's tag checker fetches the raw HTML and looks for the exact
 * snippet, so a client-injected loader reads as "tag not detected". Inlining it
 * also matches Google's own instructions (loader in <head>, noscript in <body>).
 *
 * GTM pulls its script and the tags it injects (GA4, etc.) from
 * googletagmanager.com and google-analytics.com; those origins must be allowed
 * in the CSP (see `next.config.ts`) or the browser silently blocks them.
 */
export const GTM_ID = "GTM-5VDW7C72";

export function GoogleTagManager() {
  return (
    <>
      {/* Deliberately a plain inline script, not next/script or
          @next/third-parties — both client-render and would be absent from the
          raw HTML, which is why Google reported "tag not detected". */}
      {/* eslint-disable-next-line @next/next/next-script-for-ga */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
        }}
      />
    </>
  );
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
