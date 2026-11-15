import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr";

import { AppleMark, GitHubMark, LinuxMark, WindowsMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { type DesktopPlatform, platformDownloads, platformNames } from "@/lib/downloads";
import { site } from "@/lib/site";

import "../landing.css";
import "./download.css";

export const metadata: Metadata = {
  title: "Download",
  description: "Download NativePi for Windows, macOS, and Linux. Free and open source, with Pi included.",
  alternates: { canonical: "/download" },
  openGraph: { title: "Download NativePi", url: "/download" },
};

const platforms: { id: DesktopPlatform; format: string; Mark: typeof AppleMark }[] = [
  { id: "windows", format: "Installer (.exe)", Mark: WindowsMark },
  { id: "mac", format: "Disk image (.dmg)", Mark: AppleMark },
  { id: "linux", format: "AppImage", Mark: LinuxMark },
];

export default function DownloadPage() {
  return (
    <div className="landing download-page">
      <div className="landing-rail download-layout">
        <header className="landing-header">
          <Link href="/" aria-label="NativePi home"><Wordmark className="landing-logo" /></Link>
          <Link href="/" className="quiet-link">Back to NativePi</Link>
        </header>

        <div className="download-main">
          <div className="download-intro">
            <h1>Download NativePi</h1>
            <p>Free and open source. Pi is included.</p>
          </div>

          <div className="download-platforms">
            {platforms.map(({ id, format, Mark }) => (
              <section className="download-platform" key={id} aria-labelledby={`download-${id}`}>
                <div className="download-platform-heading">
                  <h2 id={`download-${id}`}><Mark />{platformNames[id]}</h2>
                  <p>{format}</p>
                </div>
                <div className="download-builds">
                  {platformDownloads[id].map(build => (
                    <a className="landing-button landing-button-secondary download-build" key={build.target} href={`/download/${build.target}`} aria-label={`Download NativePi for ${platformNames[id]}, ${build.label}`}>
                      <span>{build.label}</span><ArrowDownIcon aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="download-support">
            <p>Installers are unsigned. Windows and macOS may show a warning on first launch. <a href={`${site.repo}#install`} target="_blank" rel="noreferrer noopener">Installation help</a></p>
            <p>Connect your own model provider when you open NativePi.</p>
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
