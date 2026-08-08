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
        Graphical extensions are trusted code running inside the window, not
        sandboxed code. Install extensions you would be willing to run in your
        shell. The API contract is versioned: renderers declare{" "}
        <code>apiVersion: 1</code> and NativePi rejects an incompatible bundle
        before any contribution runs.
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
          If the Pi-side entry imports <code>@nativepi/extension-api/host</code>
          or a shared protocol, install the package as a regular dependency
          instead. Pi loads that entry itself and does not install dev
          dependencies.
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

      <H2 id="protocol">Shared protocol</H2>
      <Prose>
        <p>
          The protocol is the typed contract between the two halves. Define it
          once, then pass it to both <code>defineRenderer</code> and{" "}
          <code>connect</code>. The recommended schemas come from{" "}
          <code>@nativepi/extension-api/schema</code>.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`import { defineProtocol } from "@nativepi/extension-api";
import { z } from "@nativepi/extension-api/schema";

export const counterProtocol = defineProtocol({
  methods: {
    state: { result: z.object({ count: z.number().int() }) },
    increment: {
      params: z.object({ by: z.number().int().positive() }),
      result: z.object({ count: z.number().int() }),
    },
  },
  events: {
    changed: z.object({ count: z.number().int() }),
  },
});`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Every method has a <code>result</code> schema; add{" "}
          <code>params</code> when it takes input. Every event maps to its
          payload schema, or <code>undefined</code> for a payload-free event.
          Values must remain JSON data: null, booleans, finite numbers, strings,
          arrays, or plain objects containing those values.
        </p>
      </Prose>

      <H2 id="define-renderer">defineRenderer</H2>
      <Prose>
        <p>
          The entry&apos;s default export. It is an identity function that exists
          for its types: it gives you completion and checking on the object you
          hand back. Write <code>apiVersion: 1</code> as a literal so an older
          bundle can identify itself to a newer host.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`function defineRenderer<const Protocol extends ExtensionProtocol>(
  renderer: NativePiRenderer<Protocol>,
): NativePiRenderer<Protocol>;

interface NativePiRenderer<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  apiVersion: 1;
  protocol?: Protocol;
  tools?: Record<string, ToolRenderer<Protocol>>;
  entries?: Record<string, EntryRenderer<Protocol>>;
  composerWidgets?: ComposerWidget<Protocol>[];
  composerControls?: ComposerControl<Protocol>[];
  settings?: SettingsSection<Protocol>[];
  panels?: ContextPanel<Protocol>[];
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

      <H2 id="context">RendererContext</H2>
      <Prose>
        <p>Every renderer and every slot receives the same context object.</p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface RendererContext<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  extension: { id: string; name: string };
  project: { path: string; name: string };
  session: { file: string | null; name?: string };
  agent: {
    status: "idle" | "starting" | "ready" | "error" | "exited";
    running: boolean;
    model?: { provider: string; id: string; name?: string };
    thinkingLevel: string;
  };
  channel: RendererChannel<Protocol>;
  actions: RendererActions;
}

interface RendererChannel<Protocol extends ExtensionProtocol> {
  call<Name extends MethodName<Protocol>>(
    method: Name,
    ...args: MethodArguments<Methods<Protocol>[Name]>
  ): Promise<MethodResult<Methods<Protocol>[Name]>>;
  on<Name extends EventName<Protocol>>(
    event: Name,
    handler: (...args: EventArguments<Events<Protocol>[Name]>) => void,
  ): () => void;
}

type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          <code>session.file</code> is <code>null</code> for a new chat.
          <code>channel.call</code> and <code>channel.on</code> are typed from
          the shared protocol and keep stable identities while the window is
          open; depend on them, rather than the context object, in an effect.
          <code>actions</code> exposes <code>notify</code>,{" "}
          <code>insertIntoComposer</code>, <code>openExternal</code>,{" "}
          <code>openFile</code>, <code>revealFile</code>, and{" "}
          <code>copyText</code>.
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
          code={`type ToolRenderer<Protocol extends ExtensionProtocol = ExtensionProtocol> = (props: {
  call: ToolCall;
  result?: ToolResult;
  context: RendererContext<Protocol>;
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
import { counterProtocol } from "./protocol.ts";

export default defineRenderer({
  apiVersion: 1,
  protocol: counterProtocol,
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
          code={`type EntryRenderer<Protocol extends ExtensionProtocol = ExtensionProtocol> = (props: {
  entry: SessionEntry;
  context: RendererContext<Protocol>;
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
          code={`interface ComposerWidget<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  placement: "aboveComposer" | "belowComposer";
  render: (context: RendererContext<Protocol>) => ReactNode;
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
          code={`interface ComposerControl<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
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
          code={`interface SettingsSection<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  heading: string;
  description?: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
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
          code={`interface ContextPanel<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  title: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
}`}
        />
      </div>

      <H2 id="host">Pi host channel</H2>
      <Prose>
        <p>
          Import <code>connect</code> from{" "}
          <code>@nativepi/extension-api/host</code> in the Pi entry. Pass the
          package name, the shared protocol, and the method handlers; emit typed
          events for renderer listeners.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { connect } from "@nativepi/extension-api/host";
import { counterProtocol } from "./protocol.ts";

export default function counterExtension(pi: ExtensionAPI) {
  let count = 0;

  const host = connect("@acme/counter", counterProtocol, {
    state: () => ({ count }),
    increment: ({ by }) => {
      count += by;
      const state = { count };
      host.emit("changed", state);
      return state;
    },
  });

  pi.registerCommand("counter", {
    description: "Show the current counter",
    handler: async (_args, ctx) => { ctx.ui.notify(\`Count: \${count}\`, "info"); },
  });
}

// host.connected is false under Pi's terminal UI.`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Registration is atomic: calling <code>connect</code> again for the
          same package replaces its complete method table, so reloads cannot
          leave removed handlers behind. Method results and event payloads are
          validated on both sides against the protocol schemas.
        </p>
        <p>
          Calls reject if no method is registered, a method throws, or it exceeds
          the thirty-second limit. In Pi&apos;s terminal there is no graphical
          host: <code>connected</code> is false and <code>emit</code> is a
          no-op, so an ordinary Pi extension remains usable.
        </p>
      </Prose>

      <H2 id="ui">Shared UI</H2>
      <Prose>
        <p>
          Import NativePi&apos;s styled primitives from
          <code> @nativepi/extension-api/ui</code>: <code>Button</code> and{" "}
          <code>Badge</code>; <code>Input</code>, <code>Textarea</code>,{" "}
          <code>Label</code>, <code>Switch</code>, <code>Separator</code>;{" "}
          <code>Field</code>, <code>FieldContent</code>,{" "}
          <code>FieldDescription</code>, <code>FieldError</code>,{" "}
          <code>FieldGroup</code>, <code>FieldLabel</code>;{" "}
          <code>Dialog</code>, <code>DialogTrigger</code>,{" "}
          <code>DialogClose</code>, <code>DialogContent</code>,{" "}
          <code>DialogHeader</code>, <code>DialogFooter</code>,{" "}
          <code>DialogTitle</code>, <code>DialogDescription</code>;{" "}
          <code>Menu</code>, <code>MenuTrigger</code>,{" "}
          <code>MenuContent</code>, <code>MenuGroup</code>,{" "}
          <code>MenuLabel</code>, <code>MenuItem</code>,{" "}
          <code>MenuSeparator</code>; <code>Select</code>,{" "}
          <code>SelectTrigger</code>, <code>SelectValue</code>,{" "}
          <code>SelectContent</code>, <code>SelectGroup</code>,{" "}
          <code>SelectLabel</code>, <code>SelectItem</code>,{" "}
          <code>SelectSeparator</code>; plus <code>SettingsActionRow</code>,{" "}
          <code>SettingsSwitchRow</code>, <code>SettingsSelectRow</code>,{" "}
          <code>SettingsTextRow</code>, and <code>SettingsSliderRow</code>.
        </p>
        <p>
          Extension Tailwind classes are not included in NativePi&apos;s
          stylesheet, so use these components and inline styles for
          extension-specific layout.
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
          trigger with <code>render</code>, not Radix&apos;s{" "}
          <code>asChild</code>.
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
// e.g. "1.0.0"`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          There are two versions with different jobs: <code>apiVersion: 1</code>{" "}
          is the renderer contract checked at load time, while{" "}
          <code>version</code> is the npm package version and is informational.
          Do not set <code>apiVersion</code> from <code>version</code>; writing
          the literal is what lets an older bundle identify itself to a newer
          host.
        </p>
      </Prose>

      <H2 id="full-example">A complete renderer</H2>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          filename="src/renderer.tsx"
          code={`import { defineRenderer } from "@nativepi/extension-api";
import { counterProtocol } from "./protocol.ts";

export default defineRenderer({
  apiVersion: 1,
  protocol: counterProtocol,

  tools: {
    "db.query": ({ call, result, context }) => (
      <ResultTable
        sql={String(call.arguments.sql ?? "")}
        rows={result?.details}
        projectDir={context.project.path}
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
      id: "target-db",
      placement: "aboveComposer",
      render: (context) => <TargetDatabase projectDir={context.project.path} />,
    },
  ],

  composerControls: [
    {
      id: "query-mode",
      render: () => <QueryModePicker />,
    },
  ],

  settings: [
    {
      id: "query-settings",
      heading: "Query settings",
      description: "Choose how this extension runs queries.",
      render: () => <QuerySettings />,
    },
  ],

  panels: [
    {
      id: "schema",
      title: "Schema",
      render: (context) =>
        context.session.file ? (
          <SchemaTree dir={context.project.path} />
        ) : (
          <p>Open a project to inspect its schema.</p>
        ),
    },
  ],
});`}
        />
      </div>

      <H2 id="migrating">Migrating from 0.x</H2>
      <Prose>
        <p>
          The version-1 contract replaces the experimental raw channel. Update
          each item together; NativePi rejects a 0.x bundle with a compatibility
          error rather than trying to interpret it as version 1.
        </p>
        <ul>
          <li>
            Add the literal <code>apiVersion: 1</code> to{" "}
            <code>defineRenderer</code>.
          </li>
          <li>
            Define one shared protocol with <code>defineProtocol</code> and pass
            it to both <code>defineRenderer</code> and{" "}
            <code>connect(packageName, protocol, handlers)</code>.
          </li>
          <li>
            Replace repeated <code>channel.method(name, handler)</code> calls
            with the handlers object passed to <code>connect</code>.
          </li>
          <li>
            Rename <code>NativePiContext</code> to{" "}
            <code>RendererContext</code> and renderer prop <code>ctx</code> to{" "}
            <code>context</code>.
          </li>
          <li>
            Replace <code>ctx.call</code> / <code>ctx.on</code> with{" "}
            <code>context.channel.call</code> /{" "}
            <code>context.channel.on</code>.
          </li>
          <li>
            Rename contribution <code>key</code> fields to <code>id</code>.
          </li>
          <li>
            Read <code>context.project</code>, <code>context.session</code>, and{" "}
            <code>context.agent</code> instead of the old nullable session
            object. The removed <code>dark</code> flag was always true because
            NativePi is dark-only.
          </li>
        </ul>
        <p>
          The ordinary Pi extension continues to load even when its optional
          graphical renderer is incompatible.
        </p>
      </Prose>

      <H2 id="notes">Practical notes</H2>
      <Prose>
        <ul>
          <li>
            <strong>Handle the empty case.</strong> <code>context.session</code>{" "}
            has <code>file: null</code> with no conversation open. Panels render
            regardless.
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
