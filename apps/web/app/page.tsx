import type { Metadata } from "next";

import { Introduction } from "@/components/landing/Introduction";
import { site } from "@/lib/site";

import "./landing.css";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.name,
  url: `${site.url}/`,
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }}
      />
      <Introduction />
    </>
  );
}
