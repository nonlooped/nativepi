import type { Metadata } from "next";

import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Extension API",
  description:
    "Build typed, schema-validated graphical surfaces for NativePi with shared protocols, controlled contribution slots, host actions, and native UI components.",
};

/**
 * Public signatures on this page track packages/extension-api/src.
 * When that package changes, this page changes with it.
 */

const manifest = [
  "{",
  '  "name": "@acme/counter",',
  '  "pi": {',
  '    "extensions": ["./src/extension.ts"]',
  "  },",
  '  "nativepi": {',
  '    "renderer": "./src/renderer.tsx"',
  "  }",
  "}",
].join("\n");

const protocolExample = [
  'import { defineProtocol } from "@nativepi/extension-api";',
  'import { z } from "@nativepi/extension-api/schema";',
  "",
  "export const counterState = z.object({ count: z.number().int() });",
  "",
  "export const counterProtocol = defineProtocol({",
  "  methods: {",
  "    state: { result: counterState },",
  "    increment: {",
  "      params: z.object({ by: z.number().int().positive() }),",
  "      result: counterState,",
  "    },",
  "  },",
  "  events: {",
  "    changed: counterState,",
  "    invalidated: undefined,",
  "  },",
  "});",
].join("\n");

const protocolSignature = [
  "interface ValueSchema<",
  "  Output extends JsonValue | undefined = JsonValue | undefined,",
  "> {",
  "  parse(value: unknown): Output;",
  "}",
  "",
  "interface MethodSchema<",
  "  Params extends ValueSchema = ValueSchema,",
  "  Result extends ValueSchema<JsonValue> = ValueSchema<JsonValue>,",
  "> {",
  "  params?: Params;",
  "  result: Result;",
  "}",
  "",
  "interface ExtensionProtocol {",
  "  methods: Readonly<Record<string, MethodSchema>>;",
  "  events: Readonly<Record<string, ValueSchema | undefined>>;",
  "}",
  "",
  "function defineProtocol<const Protocol extends ExtensionProtocol>(",
  "  protocol: Protocol,",
  "): Protocol;",
].join("\n");

const hostExample = [
  'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";',
  'import { connect } from "@nativepi/extension-api/host";',
  'import { counterProtocol } from "./protocol.ts";',
  "",
  "export default function counterExtension(pi: ExtensionAPI) {",
  "  let count = 0;",
  "",
  '  const nativepi = connect("@acme/counter", counterProtocol, {',
  "    state: () => ({ count }),",
  "    increment: ({ by }) => {",
  "      count += by;",
  "      const state = { count };",
  '      nativepi.emit("changed", state);',
  "      return state;",
  "    },",
  "  });",
  "",
  '  pi.registerCommand("counter", {',
  '    description: "Show the current counter",',
  "    handler: async (_args, context) => {",
  '      context.ui.notify("Count: " + count, "info");',
  "    },",
  "  });",
  "}",
].join("\n");

const rendererExample = [
  'import { useEffect, useState } from "react";',
  'import { defineRenderer } from "@nativepi/extension-api";',
  'import type { RendererContext } from "@nativepi/extension-api";',
  'import { Badge, Button } from "@nativepi/extension-api/ui";',
  'import { counterProtocol } from "./protocol.ts";',
  "",
  "function Counter({",
  "  context,",
  "}: {",
  "  context: RendererContext<typeof counterProtocol>;",
  "}) {",
  "  const { call, on } = context.channel;",
  "  const [count, setCount] = useState(0);",
  "",
  "  useEffect(() => {",
  "    let active = true;",
  '    void call("state").then((state) => active && setCount(state.count));',
  '    const off = on("changed", (state) => setCount(state.count));',
  "    return () => {",
  "      active = false;",
  "      off();",
  "    };",
  "  }, [call, on]);",
  "",
  "  return (",
  "    <Button",
  '      variant="ghost"',
  "      onClick={() =>",
  '        void call("increment", { by: 1 }).then((state) =>',
  "          setCount(state.count),",
  "        )",
  "      }",
  "    >",
  '      Count <Badge variant="secondary">{count}</Badge>',
  "    </Button>",
  "  );",
  "}",
  "",
  "export default defineRenderer({",
  "  apiVersion: 1,",
  "  protocol: counterProtocol,",
  "  composerControls: [",
  "    {",
  '      id: "counter",',
  "      render: (context) => <Counter context={context} />,",
  "    },",
  "  ],",
  "});",
].join("\n");

const rendererSignature = [
  "interface NativePiRenderer<",
  "  Protocol extends ExtensionProtocol = ExtensionProtocol,",
  "> {",
  "  apiVersion: 1;",
  "  protocol?: Protocol;",
  "  tools?: Record<string, ToolRenderer<Protocol>>;",
  "  entries?: Record<string, EntryRenderer<Protocol>>;",
  "  composerWidgets?: ComposerWidget<Protocol>[];",
  "  composerControls?: ComposerControl<Protocol>[];",
  "  panels?: ContextPanel<Protocol>[];",
  "  settings?: SettingsSection<Protocol>[];",
  "}",
  "",
  "function defineRenderer<",
  "  const Protocol extends ExtensionProtocol = ExtensionProtocol,",
  ">(",
  "  renderer: NativePiRenderer<Protocol>,",
  "): NativePiRenderer<Protocol>;",
].join("\n");

const contextSignature = [
  "interface RendererContext<Protocol extends ExtensionProtocol> {",
  "  extension: { id: string; name: string };",
  "  project: { path: string; name: string };",
  "  session: { file: string | null; name?: string };",
  "  agent: {",
  '    status: "idle" | "starting" | "ready" | "error" | "exited";',
  "    running: boolean;",
  "    model?: {",
  "      provider: string;",
  "      id: string;",
  "      name?: string;",
  "      reasoning?: boolean;",
  "      contextWindow?: number;",
  "    };",
  "    thinkingLevel: string;",
  "  };",
  "  channel: RendererChannel<Protocol>;",
  "  actions: RendererActions;",
  "}",
].join("\n");

const actionsSignature = [
  "interface RendererActions {",
  '  notify(message: string, tone?: "info" | "warning" | "error"): void;',
  "  insertIntoComposer(text: string): void;",
  "  openExternal(url: string): Promise<void>;",
  "  openFile(",
  "    file: string,",
  "    location?: { line?: number; column?: number },",
  "  ): Promise<void>;",
  "  revealFile(file: string): Promise<void>;",
  "  copyText(text: string): Promise<void>;",
  "}",
].join("\n");

const toolSignature = [
  "type ToolRenderer<Protocol, Arguments, Details> = (props: {",
  "  call: {",
  "    id: string;",
  "    name: string;",
  "    arguments: Arguments;",
  "  };",
  "  result?: {",
  "    toolName: string;",
  "    text: string;",
  "    details?: Details;",
  "    isError: boolean;",
  "  };",
  "  context: RendererContext<Protocol>;",
  "}) => ReactNode;",
].join("\n");

const contributionSignatures = [
  "type EntryRenderer<Protocol, Entry extends SessionEntry> = (props: {",
  "  entry: Entry;",
  "  context: RendererContext<Protocol>;",
  "}) => ReactNode;",
  "",
  "interface ComposerWidget<Protocol> {",
  "  id: string;",
  '  placement: "aboveComposer" | "belowComposer";',
  "  render: (context: RendererContext<Protocol>) => ReactNode;",
  "}",
  "",
  "interface ComposerControl<Protocol> {",
  "  id: string;",
  "  render: (context: RendererContext<Protocol>) => ReactNode;",
  "}",
  "",
  "interface ContextPanel<Protocol> {",
  "  id: string;",
  "  title: string;",
  "  render: (context: RendererContext<Protocol>) => ReactNode;",
  "}",
  "",
  "interface SettingsSection<Protocol> {",
  "  id: string;",
  "  heading: string;",
  "  description?: string;",
  "  render: (context: RendererContext<Protocol>) => ReactNode;",
  "}",
].join("\n");

const dialogExample = [
  "<Dialog>",
  '  <DialogTrigger render={<Button variant="outline">Open details</Button>} />',
  "  <DialogContent>",
  "    <DialogHeader>",
  "      <DialogTitle>Details</DialogTitle>",
  "      <DialogDescription>What this extension found.</DialogDescription>",
  "    </DialogHeader>",
  "  </DialogContent>",
  "</Dialog>",
].join("\n");

export default function ExtensionApiPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extending"
        title="Graphical extension API"
        lede="Add native interface surfaces to an ordinary Pi extension without changing how that extension behaves in Pi's terminal. A shared protocol keeps the Pi and renderer halves typed and validated across the process boundary."
      />

      <Note tone="warning">
        The graphical extension API is experimental and may change between
        releases. Renderer code is trusted package code running inside the
        window, not sandboxed code. Install only extensions you would also trust
        to run in your shell.
      </Note>

      <H2 id="architecture">Two entries, one capability</H2>
      <Prose>
        <p>A package can expose two independent entries:</p>
        <ul>
          <li>
            <code>pi.extensions</code> is the ordinary Pi extension. Pi owns its
            tools, commands, events, state, and terminal UI.
          </li>
          <li>
            <code>nativepi.renderer</code> is optional browser code that draws
            the same capability in NativePi&apos;s controlled interface slots.
          </li>
        </ul>
        <p>
          The entries do not share process memory. They communicate through a
          typed, runtime-validated protocol, and Pi&apos;s CLI never loads the
          renderer.
        </p>
      </Prose>

      <H2 id="install">Install</H2>
      <Prose>
        <p>A purely visual renderer needs only a development dependency:</p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="shell" code="bun add -d @nativepi/extension-api" />
      </div>
      <Prose className="mt-4">
        <p>
          Install it as a regular dependency when the Pi entry imports
          <code> @nativepi/extension-api/host</code> or imports a shared runtime
          protocol:
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="shell" code="bun add @nativepi/extension-api" />
      </div>
      <Prose className="mt-4">
        <p>
          React is an optional peer. NativePi supplies its own React instance at
          runtime, so renderer builds must not bundle another copy.
        </p>
      </Prose>

      <H2 id="manifest">Declare the renderer</H2>
      <Prose>
        <p>
          Keep the Pi and browser entries separate in the package manifest. The
          package name becomes the stable identity used by the host channel.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="json" filename="package.json" code={manifest} />
      </div>
      <Prose className="mt-4">
        <p>
          NativePi discovers the manifest through Pi&apos;s configured packages,
          compiles the renderer with esbuild, checks its API version and
          contribution shape, and mounts each contribution behind an error
          boundary.
        </p>
      </Prose>

      <H2 id="protocol">Define one shared protocol</H2>
      <Prose>
        <p>
          The protocol is the source of truth for calls from the renderer and
          events from the Pi process. Its schemas run on both sides of the
          channel. Import the recommended Zod instance from the API package so
          NativePi can provide it to the renderer without bundling it again.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="ts" filename="src/protocol.ts" code={protocolExample} />
      </div>
      <Prose className="mt-4">
        <p>
          Omit <code>params</code> when a method takes no input. Every method
          needs a result schema; use <code>z.null()</code> when an action has no
          meaningful result. Use <code>undefined</code> for an event with no
          payload.
        </p>
        <p>
          Values crossing the channel must remain JSON data: null, booleans,
          finite numbers, strings, arrays, or plain objects containing those
          values. Keep schemas idempotent and shape-preserving because the same
          value can be parsed on both sides of the boundary.
        </p>
      </Prose>

      <H3 id="protocol-signatures">Protocol signatures</H3>
      <div className="measure mt-4">
        <Code lang="ts" code={protocolSignature} />
      </div>

      <H2 id="host">Connect the Pi half</H2>
      <Prose>
        <p>
          <code>connect</code> registers the complete method table at once.
          Registering the same package again replaces that table atomically, so
          an extension reload cannot retain a removed handler.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="ts" filename="src/extension.ts" code={hostExample} />
      </div>
      <Prose className="mt-4">
        <p>
          The first argument must match the manifest&apos;s package name. Method
          names, arguments, results, event names, and payloads are inferred from
          the shared protocol and validated at runtime.
        </p>
        <p>
          In Pi&apos;s terminal there is no NativePi host. Handlers remain type
          checked and schemas still run, but <code>connected</code> is false and
          valid <code>emit</code> calls do nothing. Continue to provide Pi&apos;s
          own terminal UI for that case.
        </p>
      </Prose>

      <H2 id="renderer">Define the renderer</H2>
      <Prose>
        <p>
          Write <code>apiVersion: 1</code> as a literal. NativePi checks it before
          any third-party contribution function can run. Pass the shared
          protocol when the renderer communicates with its Pi half.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="tsx" filename="src/renderer.tsx" code={rendererExample} />
      </div>
      <Prose className="mt-4">
        <p>
          <code>context.channel.call</code> validates parameters before IPC and
          validates the result when it returns. <code>context.channel.on</code>
          validates each event payload before the listener runs and returns an
          unsubscribe function. Both functions keep stable identities until the
          extension reloads, so they are safe effect dependencies.
        </p>
        <p>
          Calls reject after 30 seconds or when the active chat changes before a
          result returns. Handle those failures where the reader can act on
          them.
        </p>
      </Prose>

      <H3 id="renderer-signature">Renderer signature</H3>
      <div className="measure mt-4">
        <Code lang="ts" code={rendererSignature} />
      </div>

      <H2 id="context">Renderer context</H2>
      <Prose>
        <p>
          Every contribution receives the current NativePi view as read-only
          data, a typed channel, and a small set of safe desktop actions.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="ts" code={contextSignature} />
      </div>
      <Prose className="mt-4">
        <p>
          NativePi rebuilds the context object when visible state changes. Read
          project, session, and agent fields during render. Destructure the
          stable <code>call</code> and <code>on</code> functions when an effect
          depends on them.
        </p>
        <p>
          <code>session.file</code> is <code>null</code> for a new chat that has
          not been saved yet. Renderer contributions mount only within an open
          project, so <code>project</code> is always present.
        </p>
      </Prose>

      <H3 id="actions">Renderer actions</H3>
      <Prose>
        <p>
          <code>context.actions</code> exposes operations that belong to the
          desktop surface without giving renderer code NativePi&apos;s internal
          stores or RPC client.
        </p>
      </Prose>
      <div className="measure mt-4">
        <Code lang="ts" code={actionsSignature} />
      </div>
      <Prose className="mt-4">
        <ul>
          <li>
            <code>insertIntoComposer</code> edits the draft but never sends it.
          </li>
          <li>
            <code>openExternal</code> accepts only HTTP and HTTPS URLs.
          </li>
          <li>
            <code>openFile</code> and <code>revealFile</code> accept
            project-relative paths only.
          </li>
        </ul>
        <p>
          Async actions reject when NativePi cannot complete the operation.
          Report those failures next to the control that initiated them.
        </p>
      </Prose>

      <H2 id="contributions">Contribution slots</H2>
      <Prose>
        <p>
          Every graphical surface is optional and controlled by NativePi. Array
          contributions require a unique, stable <code>id</code>; duplicate IDs
          in one slot make the renderer invalid.
        </p>
        <ul>
          <li>
            <code>tools</code> maps a Pi tool name to an inline renderer.
          </li>
          <li>
            <code>entries</code> maps a Pi session-entry type to a renderer.
          </li>
          <li>
            <code>composerWidgets</code> places keyed content directly above or
            below the composer.
          </li>
          <li>
            <code>composerControls</code> adds one compact control beside the
            model and thinking controls.
          </li>
          <li>
            <code>panels</code> adds a titled section to the project context
            pane.
          </li>
          <li>
            <code>settings</code> adds a section to{" "}
            <strong>Settings → General</strong>.
          </li>
        </ul>
        <p>
          The first configured extension with a renderer for a given tool or
          entry type owns that renderer. Graphical contributions do not replace
          the transcript, composer, navigation, or agent loop.
        </p>
      </Prose>

      <H3 id="tools">Tool renderers</H3>
      <div className="measure mt-4">
        <Code lang="ts" code={toolSignature} />
      </div>
      <Prose className="mt-4">
        <p>
          <code>result</code> is undefined while the tool is running. Design that
          state explicitly and preserve <code>isError</code> when the result
          arrives.
        </p>
      </Prose>

      <H3 id="other-slots">Other slot signatures</H3>
      <div className="measure mt-4">
        <Code lang="ts" code={contributionSignatures} />
      </div>
      <Prose className="mt-4">
        <p>
          Keep composer widgets short. Detailed content belongs in a panel or
          dialog. NativePi draws a settings section&apos;s heading and
          description, so render only the controls and keep durable state in Pi.
        </p>
      </Prose>

      <H2 id="ui">Native UI components</H2>
      <Prose>
        <p>
          Import styled controls from <code>@nativepi/extension-api/ui</code>.
          NativePi currently provides:
        </p>
        <ul>
          <li>
            <code>Button</code> and <code>Badge</code>
          </li>
          <li>
            <code>Input</code>, <code>Textarea</code>, <code>Label</code>,{" "}
            <code>Switch</code>, and <code>Separator</code>
          </li>
          <li>
            <code>Field</code>, <code>FieldContent</code>,{" "}
            <code>FieldDescription</code>, <code>FieldError</code>,{" "}
            <code>FieldGroup</code>, and <code>FieldLabel</code>
          </li>
          <li>
            <code>Dialog</code>, <code>DialogTrigger</code>,{" "}
            <code>DialogClose</code>, <code>DialogContent</code>,{" "}
            <code>DialogHeader</code>, <code>DialogFooter</code>,{" "}
            <code>DialogTitle</code>, and <code>DialogDescription</code>
          </li>
          <li>
            <code>Menu</code>, <code>MenuTrigger</code>,{" "}
            <code>MenuContent</code>, <code>MenuGroup</code>,{" "}
            <code>MenuLabel</code>, <code>MenuItem</code>, and{" "}
            <code>MenuSeparator</code>
          </li>
          <li>
            <code>Select</code>, <code>SelectTrigger</code>,{" "}
            <code>SelectValue</code>, <code>SelectContent</code>,{" "}
            <code>SelectGroup</code>, <code>SelectLabel</code>,{" "}
            <code>SelectItem</code>, and <code>SelectSeparator</code>
          </li>
          <li>
            <code>SettingsActionRow</code>, <code>SettingsSwitchRow</code>,{" "}
            <code>SettingsSelectRow</code>, <code>SettingsTextRow</code>, and{" "}
            <code>SettingsSliderRow</code>
          </li>
        </ul>
      </Prose>
      <div className="measure mt-4">
        <Code lang="tsx" code={dialogExample} />
      </div>
      <Prose className="mt-4">
        <p>
          Dialog and menu triggers use Base UI&apos;s <code>render</code> prop,
          not Radix&apos;s <code>asChild</code>. Use Phosphor icons to match
          NativePi; icons inside a button use{" "}
          <code>data-icon=&quot;inline-start&quot;</code> or{" "}
          <code>data-icon=&quot;inline-end&quot;</code>.
        </p>
        <p>
          Tailwind scans NativePi before renderer code is compiled, so classes
          invented in an extension have no generated CSS. Prefer shared
          component variants and inline styles. Semantic variables such as{" "}
          <code>var(--foreground)</code>, <code>var(--muted-foreground)</code>,{" "}
          <code>var(--border)</code>, <code>var(--destructive)</code>,{" "}
          <code>var(--warning)</code>, and <code>var(--success)</code> follow the
          active NativePi surface.
        </p>
      </Prose>

      <H2 id="compatibility">Runtime and compatibility</H2>
      <Prose>
        <p>Two versions have different jobs:</p>
        <ul>
          <li>
            <code>apiVersion: 1</code> is the renderer contract checked at load
            time.
          </li>
          <li>
            Exported <code>version</code> is the installed npm package version
            and is informational.
          </li>
        </ul>
        <p>
          Do not set <code>apiVersion</code> from{" "}
          <code>extensionApiVersion</code>. Writing the literal lets an older
          bundle identify itself to a newer NativePi host before its code runs.
          Package releases follow SemVer; a future incompatible renderer shape
          receives a new API version.
        </p>
      </Prose>

      <H2 id="migration">Migrate from the 0.x renderer API</H2>
      <Prose>
        <p>The version-1 contract replaces the experimental raw channel:</p>
        <ul>
          <li>
            Add the literal <code>apiVersion: 1</code> to{" "}
            <code>defineRenderer</code>.
          </li>
          <li>
            Define one shared protocol and pass it to both{" "}
            <code>defineRenderer</code> and <code>connect</code>.
          </li>
          <li>
            Replace repeated <code>channel.method(name, handler)</code> calls
            with the handlers object passed to{" "}
            <code>connect(packageName, protocol, handlers)</code>.
          </li>
          <li>
            Rename <code>NativePiContext</code> to{" "}
            <code>RendererContext</code> and the renderer prop{" "}
            <code>ctx</code> to <code>context</code>.
          </li>
          <li>
            Replace <code>ctx.call</code> and <code>ctx.on</code> with{" "}
            <code>context.channel.call</code> and{" "}
            <code>context.channel.on</code>.
          </li>
          <li>
            Rename contribution <code>key</code> fields to <code>id</code>.
          </li>
          <li>
            Read <code>context.project</code>, <code>context.session</code>, and{" "}
            <code>context.agent</code> instead of the old nullable session
            object. Remove the old <code>dark</code> flag.
          </li>
          <li>
            Delete renderer-side response guards that duplicate protocol
            schemas.
          </li>
        </ul>
        <p>
          NativePi rejects an old renderer with a compatibility error instead
          of interpreting it as version 1. Its ordinary Pi extension continues
          to load.
        </p>
      </Prose>

      <H2 id="practical-notes">Practical notes</H2>
      <Prose>
        <ul>
          <li>
            <strong>Keep the renderer optional.</strong> The same package should
            remain useful through Pi&apos;s terminal interface.
          </li>
          <li>
            <strong>Match the surrounding density.</strong> NativePi is a compact
            desktop interface; marketing-page spacing will look out of place.
          </li>
          <li>
            <strong>Handle async failure.</strong> Channel calls and desktop
            actions reject instead of silently succeeding.
          </li>
          <li>
            <strong>Use Pi for agent behavior.</strong> Tools, commands,
            providers, prompts, skills, sessions, and durable configuration stay
            in the ordinary Pi extension.
          </li>
        </ul>
        <p>
          Read the package source and release notes in{" "}
          <a href={site.extensionApi} target="_blank" rel="noreferrer noopener">
            the extension API package
          </a>
          .
        </p>
      </Prose>
    </>
  );
}
