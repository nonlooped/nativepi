import type { Metadata } from "next";

import { Code } from "@/components/site/Code";
import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Extension API",
  description:
    "The complete reference for @nativepi/extension-api: every contribution slot, its host channel, shared UI, and how NativePi loads a renderer.",
};

/**
 * Public signatures on this page track the latest published package.
 * Update them when a new package version is released, not for unreleased source changes.
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
        <Code lang="shell" code={`bun add -d @nativepi/extension-api`} />
      </div>
      <Prose className="mt-4">
        <p>
          That dev dependency is enough for a renderer: NativePi provides React
          and this package while it compiles the browser entry, so components
          share NativePi&apos;s React instance rather than bundling a second one.
          React&apos;s peer range is <code>^18.3.1 || ^19.0.0</code>.
        </p>
        <p>
          If the Pi-side entry imports <code>@nativepi/extension-api/host</code>,
          install the package as a regular dependency instead. Pi loads that
          entry itself and does not install dev dependencies.
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
          filename="package.json"
          code={`{
  "name": "my-pi-package",
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
          The Pi extension and renderer are separate runtime entries. Keep them
          separate: the renderer imports React for the window, while the Pi entry
          can use the optional host channel described below.
        </p>
      </Prose>

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
  composerControls?: ComposerControl[];
  settings?: SettingsSection[];
  panels?: Panel[];
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Every field is optional. Extensions contribute to controlled slots
          only: they cannot replace the composer, the transcript, the sidebar, or
          routing. NativePi places extension output behind an error boundary,
          but render functions should still avoid throwing because a failure can
          prevent that slot from mounting.
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
  call: (method: string, params?: JsonValue) => Promise<JsonValue>;
  on: (event: string, handler: (payload: JsonValue | undefined) => void) => () => void;
}

type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          <code>session</code> is <code>null</code> when no project is active.
          With a project open, <code>sessionFile</code> remains undefined until a
          conversation is selected. <code>dark</code> reports the window&apos;s
          appearance; NativePi is currently dark only, so treat a future light
          value as something to handle rather than something to assume.
        </p>
        <p>
          <code>call</code> invokes a method registered by this extension&apos;s Pi
          entry and resolves to its JSON-serializable result. <code>on</code>
          listens for a named event and returns its unsubscribe function. These
          functions are stable while the window is open; depend on them, rather
          than the context object, in an effect.
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

      <H2 id="composer-controls">Composer controls</H2>
      <Prose>
        <p>
          A control sits in the composer&apos;s compact control row, beside the
          model and thinking pickers. Return one small interactive element; use
          a widget or panel for anything larger.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface ComposerControl {
  key: string;
  render: (ctx: NativePiContext) => ReactNode;
}`}
        />
      </div>

      <H2 id="settings">Settings sections</H2>
      <Prose>
        <p>
          A settings section appears in <strong>Settings → General</strong>.
          NativePi draws its heading and optional description; the renderer
          supplies the section&apos;s controls. Persist settings that need to work
          in Pi&apos;s terminal through Pi, not NativePi-owned storage.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface SettingsSection {
  key: string;
  heading: string;
  description?: string;
  render: (ctx: NativePiContext) => ReactNode;
}`}
        />
      </div>

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

      <H2 id="host">Pi host channel</H2>
      <Prose>
        <p>
          Import <code>connect</code> from <code>@nativepi/extension-api/host</code>
          in the Pi entry. Pass the same package name NativePi read from the
          manifest, register methods for <code>ctx.call</code>, and emit events
          for <code>ctx.on</code> listeners.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`import { connect } from "@nativepi/extension-api/host";

type ExtensionMethod = (params: JsonValue | undefined) =>
  JsonValue | Promise<JsonValue>;

interface ExtensionChannel {
  connected: boolean;
  method(name: string, handler: ExtensionMethod): void;
  emit(event: string, payload?: JsonValue): void;
}

const ui = connect("@acme/my-extension");
ui.method("state", async () => ({ enabled: true }));
ui.emit("changed", { enabled: true });

// ui.connected is false under Pi's terminal UI.`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Method results and event payloads must be <code>JsonValue</code>s:
          null, booleans, numbers, strings, arrays, or objects containing those
          values. Calls reject if no method is registered, a method throws, or it exceeds the
          thirty-second limit. In Pi&apos;s terminal there is no graphical host:
          <code>connected</code> is false and calls and events are no-ops, so an
          ordinary Pi extension remains usable.
        </p>
      </Prose>

      <H2 id="ui">Shared UI</H2>
      <Prose>
        <p>
          Import NativePi&apos;s styled primitives from
          <code> @nativepi/extension-api/ui</code>: <code>Button</code>;
          <code>Dialog</code>, <code>DialogTrigger</code>,
          <code>DialogClose</code>, <code>DialogContent</code>,
          <code>DialogHeader</code>, <code>DialogFooter</code>,
          <code>DialogTitle</code>, and <code>DialogDescription</code>;
          <code>Menu</code>, <code>MenuTrigger</code>, <code>MenuContent</code>,
          <code>MenuGroup</code>, <code>MenuLabel</code>, <code>MenuItem</code>,
          and <code>MenuSeparator</code>; plus <code>SettingsActionRow</code>.
          Extension Tailwind classes are not included in NativePi&apos;s stylesheet,
          so use these components and inline styles for extension-specific layout.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<Dialog>
  <DialogTrigger render={<Button variant="outline">Open details</Button>} />
  <DialogContent>
    <DialogTitle>Details</DialogTitle>
    <DialogDescription>Information from this extension.</DialogDescription>
  </DialogContent>
</Dialog>`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          The dialog and menu triggers follow Base UI: compose a different
          trigger with <code>render</code>, not Radix&apos;s <code>asChild</code>.
        </p>
      </Prose>

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
// e.g. "0.3.0"`}
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

  composerControls: [
    {
      key: "query-mode",
      render: () => <QueryModePicker />,
    },
  ],

  settings: [
    {
      key: "query-settings",
      heading: "Query settings",
      description: "Choose how this extension runs queries.",
      render: () => <QuerySettings />,
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
          <p>Open a project to inspect its schema.</p>
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
            null with no project active; with an empty project,
            <code>sessionFile</code> is undefined. Panels render regardless.
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
