import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install NativePi",
  description:
    "Download NativePi for Windows, macOS, or Linux and handle the unsigned-app warning on first launch.",
};

export default function InstallPage() {
  return (
    <>
      <PageTitle
        eyebrow="Getting started"
        title="Install NativePi"
        lede="NativePi is distributed through GitHub Releases for Windows, macOS, and Linux. A pinned Pi build is included, so you do not need to install Pi separately."
      />

      <H2 id="download">Download</H2>
      <Prose>
        <p>
          Open the{" "}
          <a href={site.releasesLatest} target="_blank" rel="noreferrer noopener">
            latest GitHub release
          </a>{" "}
          and choose the file for your platform:
        </p>
        <ul>
          <li><strong>Windows:</strong> <code>NativePi-Setup-*.exe</code></li>
          <li>
            <strong>macOS:</strong> choose the x64 or arm64 <code>NativePi-*.dmg</code>
          </li>
          <li>
            <strong>Linux:</strong> choose the x64 or arm64 <code>NativePi-*.AppImage</code>
          </li>
        </ul>
      </Prose>

      <H2 id="install-by-platform">Install by platform</H2>
      <Prose>
        <ul>
          <li>
            <strong>Windows:</strong> Run the NSIS installer and choose an
            installation directory.
          </li>
          <li>
            <strong>macOS:</strong> Open the disk image and drag NativePi into
            Applications.
          </li>
          <li>
            <strong>Linux:</strong> Make the AppImage executable with{" "}
            <code>chmod +x NativePi-*.AppImage</code>, then run it.
          </li>
        </ul>
      </Prose>

      <Note tone="warning">
        <strong className="font-semibold text-chalk">First launch produces an OS warning.</strong>{" "}
        Releases are not code signed or notarized yet. On Windows, select{" "}
        <em>More info</em>, then <em>Run anyway</em> in SmartScreen. On macOS,
        open <em>System Settings → Privacy &amp; Security</em> and select{" "}
        <em>Open Anyway</em>. If you do not want to bypass that warning, follow
        the <Link href="/docs/build-from-source">build-from-source guide</Link>.
      </Note>

      <H2 id="updates">Updates</H2>
      <Prose>
        <p>
          NativePi checks GitHub Releases at startup and periodically for a
          newer version. It notifies you first; downloading and installing remain explicit actions. Installing
          an update stops active agent turns and terminals before the app
          restarts.
        </p>
      </Prose>

      <H2 id="uninstall">Uninstall</H2>
      <Prose>
        <p>
          Remove NativePi through Windows&apos; installed-app settings, delete it
          from Applications on macOS, or delete the AppImage on Linux. Pi&apos;s
          sessions, credentials, packages, and settings remain in{" "}
          <code>~/.pi/agent</code>.
        </p>
        <p>
          Continue with <Link href="/docs/first-run">First run</Link> after the
          application opens.
        </p>
      </Prose>
    </>
  );
}
