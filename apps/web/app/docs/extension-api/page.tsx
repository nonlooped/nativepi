import type { Metadata } from "next";
import Link from "next/link";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Extension API overview",
  description: "Understand NativePi graphical renderers, their relationship to Pi extensions, contribution slots, and the versioned runtime contract.",
};

export default function ExtensionApiPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Graphical extension API"
        lede="Add React interfaces to a Pi package without changing the package's agent behavior or its compatibility with Pi's terminal interface."
      />

      <Note tone="warning">
        Graphical renderers are trusted code running inside the NativePi window,
        not sandboxed code. Install only packages you would also run in your
        shell. NativePi validates the renderer contract before mounting it and
        places each contribution behind an error boundary.
      </Note>

      <H2 id="two-entries">One package, two entries</H2>
      <Prose>
        <p>
          A graphical package keeps its ordinary Pi extension and optional
          NativePi renderer separate. Pi owns tools, commands, events, state,
          session entries, and agent behavior. The browser renderer owns only the
          visual contributions NativePi mounts.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="text"
          code={`Pi process                         NativePi window
src/extension.ts                  src/renderer.tsx
      │                                 │
      └── connect(protocol) ◄───────────┤ context.channel.call()
              │                         │
              └── host.emit() ─────────►┤ context.channel.on()`}
        />
      </div>

      <H2 id="when-to-use">When to use the API</H2>
      <Prose>
        <p>Use a graphical renderer when a Pi capability benefits from:</p>
        <ul>
          <li>A custom tool or session-entry presentation in the transcript</li>
          <li>Compact state beside or around the composer</li>
          <li>A project-scoped panel for information the reader consults</li>
          <li>NativePi settings controls backed by extension-owned state</li>
        </ul>
        <p>
          Do not use it to add model-facing logic, replace the composer or
          transcript, make independent LLM requests, or reproduce a Pi feature.
        </p>
      </Prose>

      <H2 id="requirements">Contract and runtime</H2>
      <Prose>
        <ul>
          <li>The package is <code>@nativepi/extension-api</code>.</li>
          <li>Renderers declare the literal <code>apiVersion: 1</code>.</li>
          <li>React <code>^18.3.1 || ^19.0.0</code> is supported and supplied by NativePi.</li>
          <li>Cross-process values must be JSON-compatible and validated by synchronous schemas.</li>
          <li>Renderer calls have a thirty-second timeout and reject if the active chat changes.</li>
        </ul>
      </Prose>

      <H2 id="learning-path">Recommended path</H2>
      <Prose>
        <ol className="list-decimal ps-5 marker:text-dim">
          <li>
            Follow <Link href="/docs/extension-api/quickstart">Build your first renderer</Link>.
          </li>
          <li>
            Read <Link href="/docs/extension-api/package-structure">Package structure</Link>{" "}
            before adding runtime dependencies.
          </li>
          <li>
            Add communication with <Link href="/docs/extension-api/protocols">Typed protocols</Link>{" "}
            and the <Link href="/docs/extension-api/host-channel">Host channel</Link>.
          </li>
          <li>
            Choose a <Link href="/docs/extension-api/contributions">Contribution slot</Link>{" "}
            and use the <Link href="/docs/extension-api/ui">Shared UI</Link>.
          </li>
          <li>
            Keep the <Link href="/docs/extension-api/reference">API reference</Link>{" "}
            open while implementing.
          </li>
        </ol>
      </Prose>
    </>
  );
}
