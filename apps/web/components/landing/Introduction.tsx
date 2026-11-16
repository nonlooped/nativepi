import Link from "next/link";

import { AppleMark, GitHubMark, LinuxMark, PiMark, WindowsMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { site } from "@/lib/site";
import { Landscape } from "./Landscape";
import { DownloadButton } from "./DownloadButton";
import { Devices } from "./Devices";

export function Introduction() {
  return (
    <section className="landing introduction" aria-labelledby="intro-title">
      <Landscape />
      <div className="landing-rail intro-layout">
        <header className="landing-header">
          <Link href="/" aria-label="NativePi home"><Wordmark className="landing-logo" /></Link>
          <a className="quiet-link" href={site.repo} target="_blank" rel="noreferrer noopener"><GitHubMark />Open source</a>
        </header>
        <div className="intro-main">
          <div className="intro-content" data-enter>
            <h1 id="intro-title">Pi, on your<br /> desktop.</h1>
            <p className="intro-description">A desktop app for the Pi coding agent.<span className="intro-extra"> Your Pi sessions and extensions, in one workspace.</span></p>
            <div className="landing-actions">
              <DownloadButton />
              <a className="landing-button landing-button-secondary" href={site.repo} target="_blank" rel="noreferrer noopener"><GitHubMark />Star on GitHub</a>
            </div>
            <p className="intro-note">Free and open source. Pi included.</p>
          </div>
          <Devices />
        </div>
        <footer className="intro-foot">
          <div className="platform-marks" aria-label="Available for Windows, macOS, and Linux">
            <span><WindowsMark />Windows</span><span><AppleMark />macOS</span><span><LinuxMark />Linux</span>
          </div>
          <div className="site-notes">
            <a href={site.pi} target="_blank" rel="noreferrer noopener"><PiMark />Built on Pi</a>
            <a href={site.license} target="_blank" rel="noreferrer noopener">MIT license</a>
          </div>
        </footer>
      </div>
    </section>
  );
}
