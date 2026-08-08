import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Extension package structure",
  description: "Structure a Pi package with separate host and renderer entries, a shared protocol, and correctly scoped dependencies.",
};

export default function PackageStructurePage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Package structure"
        lede="The Pi entry runs under Node with full extension capabilities. The renderer entry runs as browser code inside NativePi. Keep their imports and responsibilities separate."
      />

      <H2 id="layout">Recommended layout</H2>
      <div className="measure mt-4">
        <Code
          lang="text"
          code={`my-package/
├── package.json
└── src/
    ├── extension.ts   # ordinary Pi extension
    ├── renderer.tsx   # NativePi browser renderer
    └── protocol.ts    # JSON schemas shared by both`}
        />
      </div>

      <H2 id="manifest">Manifest</H2>
      <div className="measure mt-4">
        <Code
          lang="json"
          filename="package.json"
          code={`{
  "name": "@acme/my-package",
  "type": "module",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./src/extension.ts"]
  },
  "nativepi": {
    "renderer": "./src/renderer.tsx"
  }
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          NativePi discovers packages through Pi&apos;s configured package list,
          reads <code>nativepi.renderer</code>, compiles that browser entry with
          esbuild, then validates its default export. The path is relative to the
          package root.
        </p>
      </Prose>

      <H2 id="entry-boundary">Entry boundary</H2>
      <Prose>
        <ul>
          <li>
            <strong>Pi entry:</strong> may use Node APIs and Pi&apos;s extension API.
            It must not import React components or renderer-only modules.
          </li>
          <li>
            <strong>Renderer entry:</strong> may use React, shared UI, the
            renderer context, and browser-safe dependencies. It must not import
            Node APIs or Pi&apos;s extension runtime.
          </li>
          <li>
            <strong>Shared protocol:</strong> contains only schemas and the
            protocol definition. Its runtime values must work in both processes.
          </li>
        </ul>
      </Prose>

      <H2 id="dependencies">Dependencies</H2>
      <Prose>
        <p>
          Install <code>@nativepi/extension-api</code> as a normal dependency if
          the Pi entry imports <code>/host</code> or the protocol module imports
          it at runtime. Pi installs production dependencies for distributed
          packages, so a dev dependency would be unavailable to that entry.
        </p>
        <p>
          A purely visual renderer may use it as a dev dependency. NativePi
          supplies React and extension API host modules while bundling, ensuring
          every renderer uses the window&apos;s existing React instance. Other
          renderer dependencies are included in the renderer bundle.
        </p>
      </Prose>

      <Note>
        Tailwind does not scan third-party renderer source. Classes invented in
        the extension will not have generated CSS. Use the{" "}
        <Link href="/docs/extension-api/ui">shared UI exports</Link>, semantic CSS
        variables, and inline styles for package-specific layout.
      </Note>

      <H2 id="loading">Load behavior</H2>
      <Prose>
        <p>
          The ordinary Pi entry and graphical renderer fail independently. A
          missing, incompatible, or broken renderer produces a NativePi package
          error but does not prevent the Pi extension from loading. A package
          without <code>nativepi.renderer</code> remains an ordinary Pi package.
        </p>
        <p>
          Continue with <Link href="/docs/extension-api/protocols">Typed protocols</Link>{" "}
          if the two entries need to communicate.
        </p>
      </Prose>
    </>
  );
}
