import type { Metadata } from "next";

import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Extension API reference",
  description: "Reference every @nativepi/extension-api entrypoint, renderer contribution, context action, protocol type, host function, and shared UI export.",
};

export default function ExtensionApiReferencePage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension reference"
        title="API reference"
        lede="The public version 1 contract exported by @nativepi/extension-api. Signatures on this page track the latest published package rather than unreleased source changes."
      />

      <H2 id="entrypoints">Package entrypoints</H2>
      <Prose>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Import</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td><code>@nativepi/extension-api</code></td><td>Renderer definition, protocol definition, context, contribution, and protocol types</td></tr>
              <tr><td><code>@nativepi/extension-api/host</code></td><td>Pi-process <code>connect</code> function and host protocol types</td></tr>
              <tr><td><code>@nativepi/extension-api/schema</code></td><td>Host-provided Zod 4 export</td></tr>
              <tr><td><code>@nativepi/extension-api/ui</code></td><td>Host-provided React components and prop types</td></tr>
            </tbody>
          </table>
        </div>
      </Prose>

      <H2 id="versions">Versions</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`const extensionApiVersion: 1;
const version: string; // npm package version, for example "1.0.0"`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          <code>apiVersion: 1</code> is the renderer contract checked at load
          time. <code>version</code> is informational package metadata. Write the
          API version as a literal in the renderer; do not derive it from either
          export, because the embedded literal lets a newer host identify an old
          bundle before executing it.
        </p>
      </Prose>

      <H2 id="define-renderer">defineRenderer</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`function defineRenderer<
  const Protocol extends ExtensionProtocol = ExtensionProtocol,
>(renderer: NativePiRenderer<Protocol>): NativePiRenderer<Protocol>;

interface NativePiRenderer<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  apiVersion: 1;
  protocol?: Protocol;
  tools?: Record<string, ToolRenderer<Protocol>>;
  entries?: Record<string, EntryRenderer<Protocol>>;
  composerWidgets?: ComposerWidget<Protocol>[];
  composerControls?: ComposerControl<Protocol>[];
  panels?: ContextPanel<Protocol>[];
  settings?: SettingsSection<Protocol>[];
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          An identity function that contextually types the renderer definition.
          The default export of <code>nativepi.renderer</code> must be the returned
          object.
        </p>
      </Prose>

      <H2 id="renderer-context">RendererContext</H2>
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
    model?: RendererModel;
    thinkingLevel: string;
  };
  channel: RendererChannel<Protocol>;
  actions: RendererActions;
}

interface RendererModel {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
}`}
        />
      </div>

      <H3 id="renderer-actions">RendererActions</H3>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface RendererActions {
  notify(message: string, tone?: "info" | "warning" | "error"): void;
  insertIntoComposer(text: string): void;
  openExternal(url: string): Promise<void>;
  openFile(
    file: string,
    location?: { line?: number; column?: number },
  ): Promise<void>;
  revealFile(file: string): Promise<void>;
  copyText(text: string): Promise<void>;
}`}
        />
      </div>

      <H2 id="toolrenderer">ToolRenderer</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`type ToolRenderer<
  Protocol extends ExtensionProtocol = ExtensionProtocol,
  Arguments extends Record<string, unknown> = Record<string, unknown>,
  Details = unknown,
> = (props: {
  call: ToolCall<Arguments>;
  result?: ToolResult<Details>;
  context: RendererContext<Protocol>;
}) => ReactNode;

interface ToolCall<Arguments extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: string;
  arguments: Arguments;
}

interface ToolResult<Details = unknown> {
  toolName: string;
  text: string;
  details?: Details;
  isError: boolean;
}`}
        />
      </div>

      <H2 id="entryrenderer">EntryRenderer</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`type EntryRenderer<
  Protocol extends ExtensionProtocol = ExtensionProtocol,
  Entry extends SessionEntry = SessionEntry,
> = (props: {
  entry: Entry;
  context: RendererContext<Protocol>;
}) => ReactNode;

interface SessionEntry {
  id: string;
  type: string;
  [key: string]: unknown;
}`}
        />
      </div>

      <H2 id="array-contributions">Array contributions</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface ComposerWidget<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  placement: "aboveComposer" | "belowComposer";
  render: (context: RendererContext<Protocol>) => ReactNode;
}

interface ComposerControl<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
}

interface ContextPanel<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  title: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
}

interface SettingsSection<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  id: string;
  heading: string;
  description?: string;
  render: (context: RendererContext<Protocol>) => ReactNode;
}`}
        />
      </div>

      <H2 id="protocol">Protocol API</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`interface ValueSchema<Output extends JsonValue | undefined = JsonValue | undefined> {
  parse(value: unknown): Output;
}

interface MethodSchema<
  Params extends ValueSchema = ValueSchema,
  Result extends ValueSchema<JsonValue> = ValueSchema<JsonValue>,
> {
  params?: Params;
  result: Result;
}

interface ExtensionProtocol {
  methods: Readonly<Record<string, MethodSchema>>;
  events: Readonly<Record<string, ValueSchema | undefined>>;
}

function defineProtocol<const Protocol extends ExtensionProtocol>(
  protocol: Protocol,
): Protocol;`}
        />
      </div>

      <H3 id="renderer-channel">RendererChannel</H3>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`type SchemaOutput<Schema> = Schema extends ValueSchema<infer Output> ? Output : never;
type Methods<Protocol extends ExtensionProtocol> = Protocol["methods"];
type Events<Protocol extends ExtensionProtocol> = Protocol["events"];
type MethodParams<Method> = Method extends { params: infer Schema }
  ? SchemaOutput<Schema>
  : undefined;
type MethodResult<Method> = Method extends { result: infer Schema }
  ? SchemaOutput<Schema>
  : never;
type EventPayload<Event> = SchemaOutput<Event>;
type OptionalArguments<Value> = [Value] extends [undefined]
  ? []
  : undefined extends Value
    ? [value?: Value]
    : [value: Value];

type MethodArguments<Method> = OptionalArguments<MethodParams<Method>>;
type EventArguments<Event> = OptionalArguments<EventPayload<Event>>;

interface RendererChannel<Protocol extends ExtensionProtocol = ExtensionProtocol> {
  call<Name extends keyof Methods<Protocol> & string>(
    method: Name,
    ...args: MethodArguments<Methods<Protocol>[Name]>
  ): Promise<MethodResult<Methods<Protocol>[Name]>>;

  on<Name extends keyof Events<Protocol> & string>(
    event: Name,
    handler: (...args: EventArguments<Events<Protocol>[Name]>) => void,
  ): () => void;
}`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Public helper types <code>MethodArguments</code> and{" "}
          <code>EventArguments</code> derive optional or required tuple arguments
          from schema outputs. Method result types are inferred directly on{" "}
          <code>call</code>.
        </p>
      </Prose>

      <H2 id="connect">connect</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`function connect<Protocol extends ExtensionProtocol>(
  extension: string,
  protocol: Protocol,
  handlers: ExtensionMethodHandlers<Protocol>,
): ExtensionHost<Protocol>;

interface ExtensionHost<Protocol extends ExtensionProtocol> {
  readonly connected: boolean;
  emit<Name extends keyof Events<Protocol> & string>(
    event: Name,
    ...args: EventArguments<Events<Protocol>[Name]>
  ): void;
}

type ExtensionMethodHandlers<Protocol extends ExtensionProtocol> = {
  [Name in keyof Methods<Protocol> & string]: (
    ...args: MethodArguments<Methods<Protocol>[Name]>
  ) =>
    | MethodResult<Methods<Protocol>[Name]>
    | Promise<MethodResult<Methods<Protocol>[Name]>>;
};`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Import from <code>@nativepi/extension-api/host</code>. Registration is
          atomic for the package name. <code>connected</code> is false and valid
          emissions are no-ops outside NativePi.
        </p>
      </Prose>

      <H2 id="jsonvalue">JsonValue</H2>
      <div className="measure mt-4">
        <Code
          lang="ts"
          code={`type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };`}
        />
      </div>

      <H2 id="ui-exports">UI exports</H2>
      <Prose>
        <p>
          <code>@nativepi/extension-api/ui</code> exports these component values
          and their specialized prop interfaces:
        </p>
        <ul>
          <li><strong>Actions:</strong> <code>Button</code>, <code>Badge</code></li>
          <li><strong>Inputs:</strong> <code>Input</code>, <code>Textarea</code>, <code>Label</code>, <code>Switch</code>, <code>Separator</code></li>
          <li><strong>Fields:</strong> <code>Field</code>, <code>FieldContent</code>, <code>FieldDescription</code>, <code>FieldError</code>, <code>FieldGroup</code>, <code>FieldLabel</code></li>
          <li><strong>Dialogs:</strong> <code>Dialog</code>, <code>DialogTrigger</code>, <code>DialogClose</code>, <code>DialogContent</code>, <code>DialogHeader</code>, <code>DialogFooter</code>, <code>DialogTitle</code>, <code>DialogDescription</code></li>
          <li><strong>Menus:</strong> <code>Menu</code>, <code>MenuTrigger</code>, <code>MenuContent</code>, <code>MenuGroup</code>, <code>MenuLabel</code>, <code>MenuItem</code>, <code>MenuSeparator</code></li>
          <li><strong>Selects:</strong> <code>Select</code>, <code>SelectTrigger</code>, <code>SelectValue</code>, <code>SelectContent</code>, <code>SelectGroup</code>, <code>SelectLabel</code>, <code>SelectItem</code>, <code>SelectSeparator</code></li>
          <li><strong>Settings:</strong> <code>SettingsActionRow</code>, <code>SettingsSwitchRow</code>, <code>SettingsSelectRow</code>, <code>SettingsTextRow</code>, <code>SettingsSliderRow</code></li>
        </ul>
        <p>
          Standard elements extend their corresponding React component props.
          Specialized interfaces include <code>ButtonProps</code>,{" "}
          <code>BadgeProps</code>, <code>DialogProps</code>,{" "}
          <code>MenuProps</code>, <code>MenuContentProps</code>,{" "}
          <code>MenuItemProps</code>, <code>SwitchProps</code>,{" "}
          <code>SelectProps</code>, <code>SelectTriggerProps</code>,{" "}
          <code>SelectContentProps</code>, <code>SelectItemProps</code>,{" "}
          <code>FieldProps</code>, <code>FieldErrorProps</code>, and every settings
          row&apos;s props.
        </p>
      </Prose>

      <H2 id="runtime-limits">Runtime limits</H2>
      <Prose>
        <ul>
          <li>Renderer code is trusted and not sandboxed.</li>
          <li>Method calls time out after thirty seconds.</li>
          <li>Calls reject when their chat is no longer active.</li>
          <li>The first configured tool or entry renderer for a key wins.</li>
          <li>Array contribution IDs must be unique within their slot.</li>
          <li>React and API host modules are supplied by NativePi; other renderer dependencies are bundled.</li>
          <li>Renderer Tailwind source is not scanned by NativePi.</li>
        </ul>
      </Prose>

      <Note>
        The authoritative declarations are in{" "}
        <a href={site.extensionApi} target="_blank" rel="noreferrer noopener">
          packages/extension-api
        </a>
        . Use the installed package&apos;s TypeScript declarations when this page
        and your dependency version differ.
      </Note>
    </>
  );
}
