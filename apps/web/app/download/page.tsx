import type { Metadata } from "next";
import Link from "next/link";

import { DownloadChoices } from "@/components/landing/DownloadChoices";
import { Wordmark } from "@/components/site/Wordmark";

import "../landing.css";

export const metadata: Metadata = { title: "Download NativePi", description: "Download NativePi for macOS, Windows, or Linux. Free, open source, and built on Pi." };

export default function DownloadPage() {
  return (
    <div className="landing download-page">
      <header className="landing-header landing-rail"><Link href="/" aria-label="NativePi home"><Wordmark className="landing-logo" /></Link><Link className="quiet-link" href="/">Back to NativePi</Link></header>
      <div className="download-page-content">
        <h1>Download NativePi</h1>
        <p>Free and open source. Connect your own model provider.</p>
        <DownloadChoices />
      </div>
    </div>
  );
}
