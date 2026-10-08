import type { Metadata } from "next";
import { GoogleTagManager, GoogleTagManagerNoScript } from "@/components/google-tag-manager";
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
        <GoogleTagManager />
      </head>
      <body className="min-h-full bg-paper font-sans text-ink antialiased">
        <GoogleTagManagerNoScript />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
