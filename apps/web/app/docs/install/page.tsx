import type { Metadata } from "next";

import { Code } from "@/components/site/Code";
import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install and first run",
  description:
    "Download NativePi, get past the SmartScreen warning, open your first project, and sign in to a provider.",
};

export default function InstallPage() {
  return (
    <>
      <PageTitle
        eyebrow="Getting started"
        title="Install and first run"
        lede="NativePi is a Windows desktop application distributed through GitHub Releases. It bundles Pi, so this is the only thing you need to install."
      />

      <H2 id="requirements">Requirements</H2>
      <Prose>
        <ul>
          <li>
            <strong>Windows.</strong> The host is currently Windows only. There
            is no macOS or Linux build.
          </li>
          <li>
            <strong>Nothing else.</strong> A pinned build of Pi ships inside the
            installer. If you already have the Pi command line, NativePi will
            reuse its credentials, configuration, and sessions rather than
            creating its own.
          </li>
        </ul>
      </Prose>

      <H2 id="download">Download</H2>
      <Prose>
        <p>
          Grab the latest installer from{" "}
          <a href={site.releases} target="_blank" rel="noreferrer noopener">
            GitHub Releases
          </a>
          . Run it and pick an installation directory when prompted.
        </p>
      </Prose>

      <Note tone="warning">
        <strong className="font-semibold text-chalk">
          Windows will warn you on first launch.
        </strong>{" "}
        Releases are not code signed yet, so SmartScreen shows an
        &ldquo;unrecognized app&rdquo; dialog. Choose <em>More info</em>, then{" "}
        <em>Run anyway</em>. If you would rather not click through that, build
        from source instead.
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
            <strong>Trust it.</strong> The header shows the project&apos;s trust
            state. Pi will not run tools in an untrusted directory, so confirm
            this for folders you own.
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
bun run dist:win              # build the Windows installer`}
        />
      </div>

      <Prose className="mt-6">
        <p>
          The desktop application lives in <code>apps/desktop</code>. The public
          graphical extension contract lives in{" "}
          <code>packages/extension-api</code>.
        </p>
      </Prose>

      <H2 id="uninstalling">Uninstalling</H2>
      <Prose>
        <p>
          Remove it like any other Windows application. Nothing of yours goes
          with it: your sessions, credentials, packages, and settings are
          Pi&apos;s and stay in <code>~/.pi/agent</code>, ready for the Pi
          command line or a future install.
        </p>
      </Prose>
    </>
  );
}
