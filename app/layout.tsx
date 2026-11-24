import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { SiteFooter, SiteHeader, chromeStyles } from "@/components/ui/SiteChrome";
import { t } from "@/lib/i18n";
import "../public/brand/tokens.css";
import "./globals.css";

// One typeface for the whole site, released under the SIL Open Font License. 700 is used for headings.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${t.site.name}: trade evolutions for your Pokémon save`,
  description: t.site.tagline,
  applicationName: t.site.name,
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: { title: t.site.name, description: t.site.tagline, siteName: t.site.name, type: "website" },
  twitter: { card: "summary", title: t.site.name, description: t.site.tagline },
};

// The browser needs literal colours here (a meta tag cannot read CSS variables): they are the --color-bg value of tokens.css.
export const viewport: Viewport = {
  themeColor: "#120C1A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>
        <SiteHeader />
        <main className={chromeStyles.main}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
