import Script from "next/script";

/**
 * Google Tag Manager. The container id is a public, browser-safe value (it is
 * visible in the page source by design), so it may be committed. The loader is
 * `afterInteractive` so it never blocks first paint.
 *
 * GTM pulls its script and the tags it injects (GA4, etc.) from
 * googletagmanager.com and google-analytics.com; those origins must be allowed
 * in the CSP (see `next.config.ts`) or the browser silently blocks them.
 */
export const GTM_ID = "GTM-5VDW7C72";

export function GoogleTagManager() {
  return (
    <>
      <Script id="gtm-init" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}
