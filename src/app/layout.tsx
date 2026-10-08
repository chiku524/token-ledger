import type { Metadata } from "next";
import Script from "next/script";
import { GTM_ID } from "@/components/google-tag-manager";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Self-hosted via Fontsource so production builds (OpenNext/Cloudflare) never
// hit next/font/google → Turbopack's flaky Google Fonts download path.
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/poppins/latin-600.css";

export const metadata: Metadata = {
  title: {
    default: "Token Ledger",
    template: "%s · Token Ledger",
  },
  description:
    "See crypto held in wallets, exchanges, and custodians, then match it to the journal.",
};

const themeScript = `(function(){try{var stored=localStorage.getItem("tl-theme");var dark=stored!=="light";document.documentElement.classList.toggle("dark", dark);document.documentElement.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className="dark h-full" suppressHydrationWarning>
      <head>
        {/*
          Google Tag Manager, as Google's snippet. `beforeInteractive` (not the
          `afterInteractive` in Google's example) is required so the snippet is
          emitted into the server-rendered <head>: with `afterInteractive` it only
          ships inside the React data blob and is injected after hydration, so a
          tag checker reading the raw HTML reports it as not installed. Next.js
          documents this strategy for a global script in the root layout, which
          this is — the lint rule only knows about Pages Router `_document.js`.
        */}
        <Script id="google-tag-manager" strategy="beforeInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      </head>
      <body className="min-h-full bg-paper font-sans text-ink antialiased">
        <noscript
          dangerouslySetInnerHTML={{
            __html: `<iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
