import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Space_Grotesk } from "next/font/google";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-grotesk",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
});

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
    <html lang="en" className={`${grotesk.variable} ${manrope.variable} ${jetbrains.variable} dark h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-paper font-sans text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
