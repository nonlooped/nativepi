import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr";

import { AppleMark, GitHubMark, LinuxMark, WindowsMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { Landscape } from "@/components/landing/Landscape";
import { type DesktopPlatform, platformDownloads, platformNames } from "@/lib/downloads";
import { site } from "@/lib/site";

import "../landing.css";
import "./download.css";

const title = "Download NativePi for Windows, macOS, and Linux";
const description = "Download NativePi for Windows, macOS, and Linux. Free and open source, with Pi included.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/download" },
  // Next replaces nested metadata objects instead of merging their fields.
  openGraph: {
    type: "website",
    url: "/download",
    siteName: site.name,
    title,
    description,
    images: [site.shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [site.shareImage],
  },
};

const platforms: { id: DesktopPlatform; note?: string; Mark: typeof AppleMark }[] = [
  { id: "windows", note: "Unsigned installer", Mark: WindowsMark },
  { id: "mac", note: "Unsigned installer", Mark: AppleMark },
  { id: "linux", Mark: LinuxMark },
];

export default function DownloadPage() {
  return (
    <div className="landing download-page">
      <Landscape scene="dunes" />
      <div className="landing-rail download-layout">
        <header className="landing-header">
          <Link href="/" aria-label="NativePi home"><Wordmark className="landing-logo" /></Link>
          <Link href="/" className="quiet-link">Back to NativePi</Link>
        </header>

        <div className="download-main">
          <div className="download-intro">
            <h1>Download <span>NativePi</span></h1>
            <p>Latest stable release. Free, with Pi included.</p>
            <p className="download-nightly-note">Nightly builds include the newest changes and may be unstable.</p>
          </div>

          <div className="download-platforms">
            {platforms.map(({ id, note, Mark }) => (
              <section className="download-platform" key={id} aria-labelledby={`download-${id}`}>
                <div className="download-platform-heading">
                  <h2 id={`download-${id}`}><Mark />{platformNames[id]}</h2>
                  {note && <p>{note}</p>}
                </div>
                <div className="download-builds">
                  {platformDownloads[id].map(build => (
                    <div className="download-choice" key={build.target}><a className="download-build" href={`/download/${build.target}`} aria-label={`Download NativePi for ${platformNames[id]}, ${build.label}`}>
                      <span>{build.label}</span><span className="download-build-action"><ArrowDownIcon aria-hidden="true" /></span>
                    </a>
                    <a className="download-nightly" href={`/download/${build.target}?channel=nightly`} aria-label={`Download latest nightly for ${platformNames[id]}, ${build.label}`}>Nightly <ArrowDownIcon aria-hidden="true" /></a>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

        </div>

        <footer className="download-footer">
          <a className="quiet-link" href={site.repo} target="_blank" rel="noreferrer noopener"><GitHubMark /><span><span className="download-github-name">NativePi on </span>GitHub</span></a>
          <nav aria-label="Releases"><a href={site.releasesLatest} target="_blank" rel="noreferrer noopener">Release notes</a><a href={site.releases} target="_blank" rel="noreferrer noopener">Nightly builds</a></nav>
        </footer>
      </div>
    </div>
  );
}
