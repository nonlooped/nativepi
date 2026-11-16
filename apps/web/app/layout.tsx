import type { Metadata, Viewport } from "next";

import { Analytics } from "@vercel/analytics/next";
import { site } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.author, url: site.repo }],
  creator: site.author,
  verification: {
    google: "d5maEtSw1GYOz8UJ1bQmUxojH-Pk34YWDovb2u_cR_Q",
  },
  keywords: [
    "NativePi",
    "Pi coding agent",
    "coding agent",
    "desktop",
    "cross-platform desktop",
    "Windows",
    "macOS",
    "Linux",
    "Electron",
    "open source",
  ],
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: site.title,
    description: site.description,
    images: [site.shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
    images: [site.shareImage],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#141414",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-ink text-chalk antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-primary-chalk focus:px-4 focus:py-2 focus:text-sm focus:text-popover"
        >
          Skip to content
        </a>
        <main id="main">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
