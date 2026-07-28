import type { Metadata, Viewport } from "next";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { SmoothScroll } from "@/components/site/SmoothScroll";
import { site } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.author, url: site.repo }],
  creator: site.author,
  keywords: [
    "NativePi",
    "Pi coding agent",
    "coding agent",
    "desktop",
    "Windows",
    "Electron",
    "open source",
  ],
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: [
      { url: "/og.png", width: 1280, height: 640, alt: `${site.name}` },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#131316",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          Without JavaScript the scroll rig never runs, so the stage would stay
          collapsed at its closed position for 460vh. This flattens it into the
          same vertical arrangement narrow screens get, which is a complete
          reading of the page rather than a degraded one.
        */}
        <noscript>
          <style>{`
            .stage-section { height: auto !important; }
            .stage-sticky {
              position: static !important;
              height: auto !important;
              overflow: visible !important;
              display: block !important;
              padding-block: 7rem 4rem;
            }
            .stage-scene {
              position: static !important;
              perspective: none !important;
              display: block !important;
            }
            .stage-scene > * {
              transform: none !important;
              aspect-ratio: auto !important;
              display: grid !important;
              gap: 2rem;
            }
            .stage-plate {
              position: relative !important;
              inset: auto !important;
              transform: none !important;
              opacity: 1 !important;
              aspect-ratio: 16 / 10;
            }
            .stage-annotation {
              position: static !important;
              transform: none !important;
              opacity: 1 !important;
              margin-block: 2rem;
            }
            .stage-annotation > div { background: none !important; padding-top: 0 !important; }
          `}</style>
        </noscript>
      </head>
      <body className="bg-void text-chalk antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary-chalk focus:px-4 focus:py-2 focus:text-sm focus:text-popover"
        >
          Skip to content
        </a>
        <SmoothScroll />
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
