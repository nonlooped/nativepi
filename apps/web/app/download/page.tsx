import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr";

import { AppleMark, GitHubMark, LinuxMark, WindowsMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { Landscape } from "@/components/landing/Landscape";
import { type DesktopPlatform, platformDownloads, platformNames, downloadFailureSchema } from "@/lib/downloads";
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

export default async function DownloadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const failure = downloadFailureSchema.safeParse(await searchParams);
  const unavailable = failure.success ? failure.data : null;
  const failedPlatform = platforms.find(platform => platformDownloads[platform.id].some(build => build.target === unavailable?.unavailable));
  const failedBuild = failedPlatform ? platformDownloads[failedPlatform.id].find(build => build.target === unavailable?.unavailable) : undefined;
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
            <p className="download-nightly-note">Connect a supported AI subscription or API account after installing. Its usage limits and charges apply.</p>
          </div>

          <div className="download-options">
          {unavailable && failedPlatform && failedBuild ? <div className="download-problem" role="alert"><p><strong>The {platformNames[failedPlatform.id]} {failedBuild.label} {unavailable.channel} download is unavailable.</strong> No download started. Try again or choose a build from GitHub Releases.</p><div><a href={`/download/${unavailable.unavailable}?channel=${unavailable.channel}&retry=1`}>Try this download again</a><a href={unavailable.channel === "nightly" ? site.releases : site.releasesLatest}>Choose a release on GitHub</a></div></div> : null}
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
                <details className="download-help"><summary>Choose a version &amp; install</summary><div><InstallHelp platform={id} /></div></details>
              </section>
            ))}
          </div>
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

function InstallHelp({ platform }: { platform: DesktopPlatform }) {
  if (platform === "mac") return <>
    <p>In the Apple menu, open <strong>About This Mac</strong>. Choose Apple Silicon if it lists an Apple chip, or Intel if it lists an Intel processor. <a href="https://support.apple.com/en-us/116943">Check your Mac’s processor</a>.</p>
    <p>Open the downloaded disk image and drag NativePi to Applications. Current builds are unsigned and not notarized, so macOS may block opening them. <a href="https://support.apple.com/en-us/102445">Read Apple’s guidance before opening an unverified app</a>.</p>
  </>;
  if (platform === "windows") return <>
    <p>Choose x64 for 64-bit Windows on an Intel or AMD computer. Check <strong>Settings → System → About → System type</strong> if unsure. <a href="https://support.microsoft.com/en-us/windows/experience/compatibility/32-bit-and-64-bit-windows-frequently-asked-questions">Check your Windows version</a>.</p>
    <p>Open the downloaded .exe and follow the setup steps. Current builds are unsigned, so Windows may show a warning. <a href="https://support.microsoft.com/en-us/windows/security/windows-security/app-browser-control-in-the-windows-security-app">Read Microsoft’s app-protection guidance</a>.</p>
  </>;
  return <>
    <p>Choose x64 for Intel or AMD computers, or ARM64 for an ARM computer. Your system’s About screen usually lists its processor; check your device’s documentation if unsure.</p>
    <p>In the downloaded AppImage’s file properties, allow it to run as a program, then open it. <a href="https://docs.appimage.org/introduction/quickstart.html">AppImage installation help</a>.</p>
  </>;
}
