import type { Metadata } from "next";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Build NativePi from source",
  description: "Clone NativePi, install dependencies with Bun, run focused checks, and package the desktop app.",
};

export default function BuildFromSourcePage() {
  return (
    <>
      <PageTitle
        eyebrow="Getting started"
        title="Build from source"
        lede="The repository is a Bun workspace. Electron is the desktop runtime; Bun manages dependencies and project scripts."
      />

      <H2 id="requirements">Requirements</H2>
      <Prose>
        <ul>
          <li><a href="https://bun.sh/" target="_blank" rel="noreferrer noopener">Bun</a></li>
          <li>Git</li>
          <li>Platform build tools required by Electron Builder for your target OS</li>
        </ul>
      </Prose>

      <H2 id="run">Run the desktop app</H2>
      <div className="measure mt-4">
        <Code
          lang="shell"
          code={`git clone https://github.com/nonlooped/nativepi.git
cd nativepi
bun install
bun run dev`}
        />
      </div>

      <Note>
        The development command starts Electron and a Vite server. Stop both
        before launching another instance; a stale server on port 5173 can make
        an old renderer look like the current build.
      </Note>

      <H2 id="checks">Run checks</H2>
      <div className="measure mt-4">
        <Code
          lang="shell"
          code={`bun run check
bun run test
bun run build`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Run the narrowest test that covers your change. The desktop source is
          in <code>apps/desktop</code>; the public graphical contract is in{" "}
          <code>packages/extension-api</code>.
        </p>
      </Prose>

      <H2 id="package">Build and package</H2>
      <div className="measure mt-4">
        <Code
          lang="shell"
          code={`bun run package -- --dir    # package without an installer
bun run package -- --win    # Windows installer
bun run package -- --mac    # macOS disk image
bun run package -- --linux  # Linux AppImage`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Build installers on their target platform. Public releases are
          produced by the repository&apos;s release automation rather than by
          manually uploading local artifacts.
        </p>
      </Prose>
    </>
  );
}
