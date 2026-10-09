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

      <H2 id="nightly">Try Nightly</H2>
      <Prose>
        <p>
          Stable is the regular release. Nightly includes eligible app changes
          from main before the next stable release. Find the latest Nightly
          prerelease on the <a href={site.releases} target="_blank" rel="noreferrer noopener">GitHub releases page</a>,
          or switch <strong>Release channel</strong> under
          <strong> Settings → System → Updates</strong> in the installed app.
        </p>
        <p>
          Nightly builds can have unfinished changes. Their versions include
          <code> -nightly.</code> and a UTC timestamp. Each installation starts on
          its matching channel; your later channel choice is saved. Returning
          to Stable can install an older stable version.
        </p>
      </Prose>

      <H2 id="updates">Updates</H2>
      <Prose>
        <p>
          On Windows and Linux, packaged NativePi checks your selected channel at startup and every
          four hours, then downloads an available update automatically. It
          installs the downloaded update when you quit. Choose
          <strong> Restart and install</strong> under
          <strong> Settings → System → Updates</strong> to apply it sooner;
          restarting closes active agent turns, terminals, and browser access.
        </p>
        <p>
          Current macOS builds are unsigned, so automatic installation is
          unavailable. Choose <strong>View downloads</strong> in Updates,
          download the Stable or Nightly DMG for your Mac, and replace NativePi
          in Applications.
        </p>
        <p>
          Update controls are available on the installed desktop app, not in a
          development run or a connected browser. Maintainers can read the
          <a href="https://github.com/nonlooped/nativepi/blob/main/docs/release.md" target="_blank" rel="noreferrer noopener"> release automation guide</a>
          for the stable and Nightly publication rules.
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
