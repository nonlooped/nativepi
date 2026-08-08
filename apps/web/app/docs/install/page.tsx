import type { Metadata } from "next";

import { Code } from "@/components/site/Code";
import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install and first run",
  description:
    "Download NativePi for Windows, macOS, or Linux, get past your OS's unsigned-app warning, open your first project, and sign in to a provider.",
};

export default function InstallPage() {
  return (
    <>
      <PageTitle
        eyebrow="Getting started"
        title="Install and first run"
        lede="NativePi is a Windows, macOS, or Linux desktop application distributed through GitHub Releases. It bundles Pi, so this is the only thing you need to install."
      />

      <H2 id="requirements">Requirements</H2>
      <Prose>
        <ul>
          <li>
            <strong>Windows, macOS, or Linux.</strong> Windows ships an NSIS
            installer, macOS a DMG, and Linux an AppImage.
          </li>
          <li>
            <strong>No separate Pi installation is required.</strong> A pinned build of Pi ships inside the
            installer. If you already have the Pi command line, NativePi will
            reuse its credentials, configuration, and sessions rather than
            creating its own.
          </li>
        </ul>
      </Prose>

      <H2 id="download">Download</H2>
      <Prose>
        <p>
          Download the installer for your platform from{" "}
          <a href={site.releases} target="_blank" rel="noreferrer noopener">
            GitHub Releases
          </a>
          : a <code>.exe</code> for Windows, a <code>.dmg</code> for macOS, or
          an <code>.AppImage</code> for Linux. On Windows, run the installer and
          pick an installation directory. On macOS, open the disk image and drag
          NativePi to Applications. On Linux, make the AppImage executable and run it.
        </p>
      </Prose>

      <Note tone="warning">
        <strong className="font-semibold text-chalk">
          Your OS will warn you on first launch.
        </strong>{" "}
        Releases are not code signed or notarized yet. Windows SmartScreen shows
        an &ldquo;unrecognized app&rdquo; dialog. Choose <em>More info</em>,
        then <em>Run anyway</em>. macOS Gatekeeper blocks the app outright the
        first time. Open <em>System Settings &gt; Privacy &amp; Security</em>{" "}
        and choose <em>Open Anyway</em>. Linux AppImages need their executable
        bit set (<code>chmod +x</code>) before they will run at all. If you
        would rather not do any of that, build from source instead.
      </Note>

      <H2 id="first-run">First run</H2>
      <Prose>
        <p>
          NativePi opens on an empty workspace. Three things get you to a working
          conversation.
        </p>
        <ol className="list-decimal pl-5 marker:text-dim">
          <li>
            <strong>Add a project.</strong> Use the folder button beside{" "}
            <code>Projects</code> in the left sidebar and pick a local folder.
            Projects stay pinned between launches.
          </li>
          <li>
            <strong>Review project trust if prompted.</strong> NativePi asks only
            when a project contains local extensions or skills. Trusting the
            folder allows that project-local code to run, so approve only folders
            whose contents you have reviewed.
          </li>
          <li>
            <strong>Sign in to a provider.</strong> Open Settings and
            authenticate whichever provider you use. Authentication is handled by
            Pi, and the credentials land in Pi&apos;s own storage.
          </li>
        </ol>
        <p>
          Type into the composer and send. Pick a model and a thinking level from
          the row beneath the input at any point, including mid-run.
        </p>
      </Prose>

      <H2 id="from-source">Running from source</H2>
      <Prose>
        <p>
          You need{" "}
          <a href="https://bun.sh/" target="_blank" rel="noreferrer noopener">
            Bun
          </a>{" "}
          and Git.
        </p>
      </Prose>

      <div className="measure mt-5">
        <Code
          lang="shell"
          code={`git clone https://github.com/nonlooped/nativepi.git
cd nativepi
bun install
bun run dev`}
        />
      </div>

      <H3 id="build-commands">Building and testing</H3>
      <div className="measure mt-4">
        <Code
          lang="shell"
          code={`cd apps/desktop && bun test   # run the test suite
cd ../.. && bun run build     # build the app
bun run pack                  # package without an installer
bun run dist:win              # build the Windows installer
bun run dist:mac              # build the macOS installer
bun run dist:linux            # build the Linux installer`}
        />
      </div>

      <Prose className="mt-6">
        <p>
          The desktop application lives in <code>apps/desktop</code>. The public
          typed graphical extension contract lives in{" "}
          <code>packages/extension-api</code>.
        </p>
      </Prose>

      <H2 id="uninstalling">Uninstalling</H2>
      <Prose>
        <p>
          Remove it like any other application for your platform: through
          Windows&apos; &ldquo;Add or remove programs,&rdquo; by dragging it out
          of <code>/Applications</code> on macOS, or by deleting the AppImage on
          Linux. Nothing of yours goes with it: your sessions, credentials,
          packages, and settings are Pi&apos;s and stay in{" "}
          <code>~/.pi/agent</code>, ready for the Pi command line or a future
          install.
        </p>
      </Prose>
    </>
  );
}
