/**
 * Google Tag Manager. The container id is a public, browser-safe value (visible
 * in the page source by design), so it may be committed.
 *
 * The snippet is rendered VERBATIM into the server HTML — a plain inline
 * `<script>` in `<head>`, then the `<noscript>` immediately after `<body>` —
 * exactly as Google's install instructions specify. It is deliberately NOT
 * `next/script` or `@next/third-parties`: both load the tag on the client after
 * hydration, so the snippet is absent from the served HTML and Google's tag
 * checker (which reads the raw HTML) reports "not detected". A static
 * `index.html` works because the snippet is literally in the file; this does the
 * same thing for a server-rendered page.
 *
 * GTM pulls its script and the tags it injects (GA4, etc.) from
 * googletagmanager.com and google-analytics.com; those origins must be allowed
 * in the CSP (see `next.config.ts`) or the browser silently blocks them.
 */
export const GTM_ID = "GTM-5VDW7C72";

/** The loader, for <head> (Google: "as high in the <head> as possible"). */
export function GoogleTagManager() {
  return (
    /* eslint-disable-next-line @next/next/next-script-for-ga */
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
      }}
    />
  );
}

/** The noscript fallback, for immediately after the opening <body> tag. */
export function GoogleTagManagerNoScript() {
  return (
    <noscript>
      {/* The snippet verbatim: Google's own hidden, unnamed iframe. */}
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
