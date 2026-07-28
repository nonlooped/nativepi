import type { Metadata } from "next";

import { Code } from "@/components/site/Code";
import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Extension API",
  description:
    "The complete reference for @nativepi/extension-api: every exported type, the four contribution slots, and how NativePi loads a renderer.",
};

/**
 * Every signature on this page is copied from packages/extension-api/src/index.ts.
 * When that file changes, this page changes with it.
 */

export default function ExtensionApiPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extending"
        title="Extension API"
        lede="A Pi extension reaches the NativePi window by importing @nativepi/extension-api, describing the slots it contributes, and default-exporting the result of defineRenderer."
      />

      <Note tone="warning">
        The graphical extension API is experimental and may change between
        releases. Graphical extensions are trusted code running inside the
        window, not sandboxed code. Install extensions you would be willing to
        run in your shell.
      </Note>

      <H2 id="install">Install</H2>
      <div className="measure mt-4">
        <Code lang="shell" code={`bun add @nativepi/extension-api`} />
      </div>
      <Prose className="mt-4">
        <p>
          React is a peer dependency (<code>^18.3.1 || ^19.0.0</code>). NativePi
          provides both React and this package at runtime, so your components
          share NativePi&apos;s React instance rather than bundling a second one.
        </p>
      </Prose>

      <H2 id="manifest">Declaring a renderer</H2>
      <Prose>
        <p>
          Add a <code>nativepi.renderer</code> entry to your Pi package manifest,
          pointing at a browser entry file. NativePi compiles that entry with
          esbuild and mounts what it exports.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="json"
          filename="pi-package.json"
          code={`{
  "name": "my-pi-package",
  "nativepi": {
    "renderer": "./src/renderer.tsx"
  }
}`}
        />
      </div>

      <H2 id="define-renderer">defineRenderer</H2>
      <Prose>
        <p>
          The entry&apos;s default export. It is an identity function that exists
          for its types: it gives you completion and checking on the object you
          hand back.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`function defineRenderer(renderer: NativePiRenderer): NativePiRenderer;

interface NativePiRenderer {
  tools?: Record<string, ToolRenderer>;
  entries?: Record<string, EntryRenderer>;
  composerWidgets?: ComposerWidget[];
  panels?: Panel[];
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Every field is optional. Extensions contribute to controlled slots
          only: they cannot replace the composer, the transcript, the sidebar, or
          routing. Each contribution is mounted behind an error boundary, so a
          component that throws takes down its own slot and nothing else.
        </p>
      </Prose>

      <H2 id="context">NativePiContext</H2>
      <Prose>
        <p>Every renderer and every slot receives the same context object.</p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface NativePiContext {
  session: {
    projectDir: string;
    sessionFile?: string;
    sessionName?: string;
  } | null;
  dark: boolean;
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          <code>session</code> is <code>null</code> when no conversation is open.
          <code>dark</code> reports the window&apos;s appearance; NativePi is
          currently dark only, so treat a future light value as something to
          handle rather than something to assume.
        </p>
      </Prose>

      <H2 id="tools">Tool renderers</H2>
      <Prose>
        <p>
          Keyed by tool name. When Pi reports a call to that tool, your component
          draws it in place of the default tool container.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`type ToolRenderer = (props: {
  call: ToolCall;
  result?: ToolResult;
  ctx: NativePiContext;
}) => ReactNode;

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  toolName: string;
  text: string;
  details?: unknown;
  isError: boolean;
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          <code>result</code> is undefined while the call is still running, which
          is the state to design for first. Respect <code>isError</code>: a
          failed call should read as failed, because in the default interface it
          is the loudest element of a turn.
        </p>
      </Prose>

      <H3 id="tools-example">Example</H3>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          filename="src/renderer.tsx"
          code={`import { defineRenderer } from "@nativepi/extension-api";

export default defineRenderer({
  tools: {
    "db.query": ({ call, result }) => {
      const sql = String(call.arguments.sql ?? "");

      if (!result) return <RunningQuery sql={sql} />;
      if (result.isError) return <QueryError sql={sql} text={result.text} />;

      return <ResultTable sql={sql} rows={result.details} />;
    },
  },
});`}
        />
      </div>

      <H2 id="entries">Entry renderers</H2>
      <Prose>
        <p>
          Keyed by session entry type. Use these when your extension writes its
          own entries into the session and you want them drawn as something other
          than raw text.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`type EntryRenderer = (props: {
  entry: SessionEntry;
  ctx: NativePiContext;
}) => ReactNode;

interface SessionEntry {
  id: string;
  type: string;
  [key: string]: unknown;
}`}
        />
      </div>

      <H2 id="composer-widgets">Composer widgets</H2>
      <Prose>
        <p>
          A widget sits directly above or below the composer. This is the slot
          for state that belongs to the next message rather than to the
          transcript.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface ComposerWidget {
  key: string;
  placement: "aboveComposer" | "belowComposer";
  render: (ctx: NativePiContext) => ReactNode;
}`}
        />
      </div>
      <Note>
        The composer is the app&apos;s most protected surface. Keep widgets to a
        single compact row: anything taller pushes the conversation off screen,
        and the composer is what the layout defends at narrow widths.
      </Note>

      <H2 id="panels">Context panels</H2>
      <Prose>
        <p>
          A titled panel added to the context pane, alongside Git changes and
          diffs. This is the slot with the most room, and the right home for
          anything a reader consults rather than reads inline.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface Panel {
  key: string;
  title: string;
  render: (ctx: NativePiContext) => ReactNode;
}`}
        />
      </div>

      <H2 id="version">version</H2>
      <Prose>
        <p>
          The package exports the version extensions see at runtime, which is
          useful when you need to branch on what the host supports.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`import { version } from "@nativepi/extension-api";
// e.g. "0.1.1"`}
        />
      </div>

      <H2 id="full-example">A complete renderer</H2>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          filename="src/renderer.tsx"
          code={`import { defineRenderer } from "@nativepi/extension-api";

export default defineRenderer({
  tools: {
    "db.query": ({ call, result, ctx }) => (
      <ResultTable
        sql={String(call.arguments.sql ?? "")}
        rows={result?.details}
        projectDir={ctx.session?.projectDir}
      />
    ),
  },

  entries: {
    "migration.applied": ({ entry }) => (
      <MigrationBadge name={String(entry.name ?? "")} />
    ),
  },

  composerWidgets: [
    {
      key: "target-db",
      placement: "aboveComposer",
      render: (ctx) => <TargetDatabase projectDir={ctx.session?.projectDir} />,
    },
  ],

  panels: [
    {
      key: "schema",
      title: "Schema",
      render: (ctx) =>
        ctx.session ? (
          <SchemaTree dir={ctx.session.projectDir} />
        ) : (
          <p>Open a chat to inspect its schema.</p>
        ),
    },
  ],
});`}
        />
      </div>

      <H2 id="notes">Practical notes</H2>
      <Prose>
        <ul>
          <li>
            <strong>Handle the empty case.</strong> <code>ctx.session</code> is
            null with no conversation open, and panels render regardless.
          </li>
          <li>
            <strong>Match the surrounding density.</strong> The window is compact
            by design. A component built at marketing-page scale will look
            wrong next to everything around it.
          </li>
          <li>
            <strong>Keep motion honest.</strong> The app neutralizes animation
            under <code>prefers-reduced-motion</code> and expects every animated
            state to have a static equivalent.
          </li>
          <li>
            <strong>Normal Pi extensions need none of this.</strong> Without a{" "}
            <code>nativepi.renderer</code> entry, your extension runs inside Pi
            exactly as it does on the command line.
          </li>
        </ul>
        <p>
          The whole public surface is one small file. Read it at{" "}
          <a
            href={site.extensionApi}
            target="_blank"
            rel="noreferrer noopener"
          >
            packages/extension-api
          </a>
          .
        </p>
      </Prose>
    </>
  );
}
