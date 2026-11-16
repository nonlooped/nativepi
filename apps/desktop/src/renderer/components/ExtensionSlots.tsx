import { createExtensionBinding } from "../lib/extensionBinding.ts";
import { runtime, runtimeEpoch } from "../lib/store/internals.ts";
import { copyText } from "@/lib/clipboard.ts";
import type {
  ExtensionProtocol,
  RendererActions,
  RendererChannel,
  RendererContext,
  SessionEntry as ExtSessionEntry,
  ToolResult,
  ValueSchema,
} from "@nativepi/extension-api";
import { lazy, Suspense, type ReactNode } from "react";
import type { SessionEntry, ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";
import { isJsonValue, type JsonValue } from "../../shared/json.ts";
import { textOf } from "../../shared/messages.ts";
import type { LoadedExtension } from "../lib/extensionHost.ts";
import { subscribeToExtension } from "../lib/extensionEvents.ts";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { absoluteProjectPath } from "../lib/paths.ts";
import { rpc } from "../lib/rpc.ts";
import { activeConversation, useAppStore, usePaneStore, type PaneStore } from "../lib/store.ts";
import { showExtensionNotification } from "../lib/toast.tsx";
import ExtensionBoundary from "./ExtensionBoundary.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SettingsSection } from "./settings/rows.tsx";

const TuiAutoPane = lazy(() => import("./TuiSurface.tsx").then((module) => ({ default: module.TuiAutoPane })));

type BaseContext = Pick<RendererContext, "project" | "session" | "agent" | "composer"> & { draftGeneration: number; store: PaneStore };

const EMPTY_PROTOCOL: ExtensionProtocol = { methods: {}, events: {} };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parse<Output extends JsonValue | undefined>(schema: ValueSchema<Output>, value: unknown, label: string): Output {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error(`${label}: ${errorMessage(error)}`, { cause: error });
  }
}

const paneBindings = new WeakMap<PaneStore, Map<LoadedExtension, ReturnType<typeof bindingFor>>>();
function bindingFor(extension: LoadedExtension, store: PaneStore) {
  const selected = store.getState();
  const epoch = runtimeEpoch(store.getState, selected.activeProjectPath);
  const binding = createExtensionBinding(() => {
    const state = store.getState();
    return runtimeEpoch(store.getState, selected.activeProjectPath) === epoch && !runtime(store.getState).disposed && state.selectionVersion === selected.selectionVersion &&
      state.activeProjectPath === selected.activeProjectPath && state.activeSessionFile === selected.activeSessionFile &&
      state.extRenderers.includes(extension);
  }, store.subscribe);
  return { ...binding, channel: null as RendererChannel | null, actions: null as RendererActions | null };
}
function viewBinding(extension: LoadedExtension, store: PaneStore) {
  let bindings = paneBindings.get(store);
  if (!bindings) { bindings = new Map(); paneBindings.set(store, bindings); }
  for (const [key, value] of bindings) if (!value.valid()) bindings.delete(key);
  let binding = bindings.get(extension);
  if (!binding) { binding = bindingFor(extension, store); bindings.set(extension, binding); }
  return binding;
}
type ViewBinding = ReturnType<typeof bindingFor>;

function bridgeFor(extension: string, protocol: ExtensionProtocol, useAppStore: PaneStore, binding: ViewBinding): RendererChannel {
  if (binding.channel) return binding.channel;
  const channel = {
    call: async (method: string, params?: JsonValue) => {
      binding.assert();
      const schema = protocol.methods[method];
      if (!schema) throw new Error(`Extension ${extension} has no declared method "${method}"`);
      let parsedParams: JsonValue | undefined;
      if (schema.params) parsedParams = parse(schema.params, params, `Invalid parameters for "${method}"`);
      else if (params !== undefined) throw new Error(`Method "${method}" does not take parameters.`);
      if (parsedParams !== undefined && !isJsonValue(parsedParams)) {
        throw new Error(`Parameters for "${method}" did not parse to a JSON value.`);
      }
      const { activeProjectPath: projectDir, activeSessionFile: sessionFile } = useAppStore.getState();
      if (!projectDir) throw new Error("No project is open");
      const { result, error } = await rpc.request.callExtension({
        projectDir,
        sessionFile,
        extension,
        method,
        ...(parsedParams === undefined ? {} : { params: parsedParams }),
      });
      if (error) throw new Error(error);
      binding.assert();
      const current = useAppStore.getState();
      if (current.activeProjectPath !== projectDir || current.activeSessionFile !== sessionFile) {
        throw new Error("Chat changed before the extension call completed");
      }
      return parse(schema.result, result, `Invalid result from "${method}"`);
    },
    on: (event: string, handler: (payload?: JsonValue) => void) => {
      binding.assert();
      if (!(event in protocol.events)) throw new Error(`Extension ${extension} has no declared event "${event}"`);
      const schema = protocol.events[event];
      return binding.own(subscribeToExtension(extension, (name, payload) => {
        if (!binding.valid()) return;
        if (name !== event) return;
        if (!schema) {
          if (payload !== undefined) throw new Error(`Event "${event}" received an unexpected payload.`);
          (handler as () => void)();
          return;
        }
        (handler as (payload: JsonValue | undefined) => void)(parse(schema, payload, `Invalid payload for "${event}"`));
      }, useAppStore.getState));
    },
  } as unknown as RendererChannel;
  binding.channel = channel;
  return channel;
}

function projectRelativeFile(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) {
    throw new Error("Expected a project-relative file path.");
  }
  let depth = 0;
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") depth -= 1;
    else depth += 1;
    if (depth < 0) throw new Error("The file is outside this project.");
  }
  return file;
}

function actionsFor(extension: string, useAppStore: PaneStore, binding: ViewBinding): RendererActions {
  if (binding.actions) return binding.actions;
  const next: RendererActions = {
    notify: (message, tone) => { binding.assert(); showExtensionNotification(`${extension}: ${message}`, tone); },
    insertIntoComposer: (text) => {
      binding.assert();
      if (!composerWritable(useAppStore.getState())) throw new Error("This conversation has a read-only composer.");
      useAppStore.getState().insertIntoComposer(text);
    },
    openExternal: async (url) => {
      binding.assert();
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Only http(s) URLs can be opened.");
      const result = await rpc.request.openExternal({ url: parsed.href });
      if (!result.ok) throw new Error("NativePi could not open that URL.");
    },
    openFile: async (file, location) => {
      binding.assert();
      const state = useAppStore.getState();
      if (!state.activeProjectPath) throw new Error("No project is open.");
      const { line, column } = location ?? {};
      const result = await rpc.request.openFileIn({
        projectDir: state.activeProjectPath,
        file: projectRelativeFile(file),
        editorId: state.preferences.preferredEditorId,
        line,
        column,
      });
      if (!result.ok) throw new Error(result.error ?? `NativePi could not open ${file}.`);
    },
    revealFile: async (file) => {
      binding.assert();
      const projectDir = useAppStore.getState().activeProjectPath;
      if (!projectDir) throw new Error("No project is open.");
      const result = await rpc.request.showInFolder({ path: absoluteProjectPath(projectDir, projectRelativeFile(file)) });
      if (!result.ok) throw new Error(`NativePi could not reveal ${file}.`);
    },
    copyText: async (text) => {
      binding.assert();
      if (!await copyText(text)) throw new Error("Could not copy text.");
    },
  };
  binding.actions = next;
  return next;
}

function composerWritable(state: ReturnType<PaneStore["getState"]>) {
  if (state.destination !== "work" || !state.activeSessionFile) return true;
  const thread = state.orchestration.threads.find(thread => thread.ref.file === state.activeSessionFile);
  return state.confirmedNewLead === state.activeSessionFile || !!(state.orchestrationLoaded && thread &&
    thread.available !== false && !thread.roleUnavailable && !thread.relationship && !state.orchestrationError);
}

function contextFor(base: BaseContext, extension: LoadedExtension): RendererContext {
  const binding = viewBinding(extension, base.store);
  return {
    composer: base.composer,
    project: base.project,
    session: base.session,
    agent: base.agent,
    extension: { id: extension.id, name: extension.name },
    channel: bridgeFor(extension.name, extension.renderer.protocol ?? EMPTY_PROTOCOL, base.store, binding),
    actions: actionsFor(extension.name, base.store, binding),
  };
}

function useRendererContext(): BaseContext {
  const store = usePaneStore();
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const projectName = useAppStore((s) => s.projects.find((project) => project.path === s.activeProjectPath)?.name);
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const draftGeneration = useAppStore(s => s.selectionVersion);
  const sessionName = useAppStore((s) => activeConversation(s).sessionName);
  const running = useAppStore((s) => activeConversation(s).running);
  const status = useAppStore((s) => s.activeProjectPath ? (s.piStatus[s.activeProjectPath] ?? "idle") : "idle");
  const model = useAppStore((s) => s.model);
  const thinkingLevel = useAppStore((s) => s.thinkingLevel);
  const writable = useAppStore(composerWritable);
  return {
    draftGeneration, store, composer: { writable },
    project: { path: projectDir ?? "", name: projectName ?? projectDir ?? "" },
    session: { file: sessionFile, name: sessionName },
    agent: { status, running, model, thinkingLevel },
  };
}

/** Invoke extension code below its boundary, rather than while building it. */
function ExtensionContribution({ render }: { render: () => ReactNode }) {
  return render();
}

// Contributions commonly load session data in an effect keyed by the stable
// channel functions. A new key remounts that work for a chat change, so a slow
// response from the old chat has no component left to update.
function sessionKey(ctx: BaseContext) {
  return JSON.stringify([ctx.project.path, ctx.session.file, ctx.draftGeneration]);
}

export function ExtensionToolResult({ call, result }: { call: ToolCall; result?: ToolResultMessage }) {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useRendererContext();
  const progress = useAppStore(s => activeConversation(s).toolProgress?.[call.id]);

  for (const ext of renderers) {
    const render = ext.renderer.tools?.[call.name];
    if (!render) continue;
    const toolResult: ToolResult | undefined = result
      ? { toolName: result.toolName, text: textOf(result.content), details: result.details, isError: result.isError }
      : undefined;
    return (
      <ExtensionBoundary key={`${ext.id}:${call.id}:${sessionKey(base)}`} name={ext.name} extensionId={ext.id}>
        <ExtensionContribution
          render={() =>
            render({
              call: { id: call.id, name: call.name, arguments: call.arguments },
              result: toolResult,
              progress: result ? undefined : progress,
              context: contextFor(base, ext),
            })
          }
        />
      </ExtensionBoundary>
    );
  }
  return null;
}

export function ExtensionEntry({ entry }: { entry: SessionEntry }) {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useRendererContext();

  for (const ext of renderers) {
    const render = ext.renderer.entries?.[entry.type];
    if (!render) continue;
    return (
      <ExtensionBoundary key={`${ext.id}:${entry.id}:${sessionKey(base)}`} name={ext.name} extensionId={ext.id}>
        <ExtensionContribution render={() => render({ entry: entry as unknown as ExtSessionEntry, context: contextFor(base, ext) })} />
      </ExtensionBoundary>
    );
  }
  return null;
}

export function useHasToolRenderer(name: string): boolean {
  return useAppStore((s) => s.extRenderers.some((e) => e.renderer.tools?.[name]));
}

export function useHasEntryRenderer(type: string): boolean {
  return useAppStore((s) => s.extRenderers.some((e) => e.renderer.entries?.[type]));
}

export function ComposerWidgets({ placement }: { placement: "aboveComposer" | "belowComposer" }) {
  const renderers = useAppStore((s) => s.extRenderers);
  const widgets = useAppStore((s) => s.extWidgets);
  const surfaces = useAppStore((s) => s.extSurfaces);
  const base = useRendererContext();

  const serializablePlacement = placement === "aboveComposer" ? "aboveEditor" : "belowEditor";
  const serializable = Object.entries(widgets).filter(([, w]) => w.placement === serializablePlacement);
  const graphical = renderers.flatMap((ext) =>
    (ext.renderer.composerWidgets ?? [])
      .filter((w) => w.placement === placement)
      .map((w) => ({ ext, w })),
  );
  // The third kind: a widget an extension passed to Pi as a pi-tui component
  // rather than as lines. Same slot, same order, drawn by the component itself.
  const terminal = surfaces.filter((surface) => surface.placement === serializablePlacement);

  if (serializable.length === 0 && graphical.length === 0 && terminal.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-(--conversation-width) flex-col gap-1">
      {serializable.map(([key, w]) => (
        <div key={key} className="rounded-xl border bg-card/60 px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {w.lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">{line}</div>
          ))}
        </div>
      ))}
      {graphical.map(({ ext, w }) => (
        <ExtensionBoundary key={`${ext.id}:${w.id}:${sessionKey(base)}`} name={ext.name} extensionId={ext.id}>
          <ExtensionContribution render={() => w.render(contextFor(base, ext))} />
        </ExtensionBoundary>
      ))}
      {terminal.map((surface) => (
        <div key={surface.id} className="overflow-hidden rounded-xl border bg-card/60">
          <Suspense fallback={null}>
            <TuiAutoPane surface={surface} maxRows={WIDGET_ROWS} />
          </Suspense>
        </div>
      ))}
    </div>
  );
}

/**
 * How tall a widget gets before it has to scroll itself.
 *
 * A terminal component cannot be measured before it draws — it is asked for a
 * width and answers with lines — so the pane has to name a height, and a widget
 * sits between the transcript and the composer where three lines is already
 * generous. Extensions with more to show have `panels`, or a `custom()` overlay.
 */
const WIDGET_ROWS = 6;

export function ComposerControls() {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useRendererContext();
  const controls = renderers.flatMap((ext) => (ext.renderer.composerControls ?? []).map((c) => ({ ext, c })));

  return controls.map(({ ext, c }) => (
    <ExtensionBoundary key={`${ext.id}:${c.id}:${sessionKey(base)}`} name={ext.name} extensionId={ext.id}>
      <ExtensionContribution render={() => c.render(contextFor(base, ext))} />
    </ExtensionBoundary>
  ));
}

export function ExtensionSettings() {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useRendererContext();
  const sections = renderers.flatMap((ext) => (ext.renderer.settings ?? []).map((s) => ({ ext, s })));

  return sections.map(({ ext, s }) => (
    <SettingsSection key={`${ext.id}:${s.id}:${sessionKey(base)}`} heading={s.heading} description={s.description}>
      <ExtensionBoundary name={ext.name} extensionId={ext.id}>
        <ExtensionContribution render={() => s.render(contextFor(base, ext))} />
      </ExtensionBoundary>
    </SettingsSection>
  ));
}

function conversationViewKey(extension: LoadedExtension, id: string) {
  return `${extension.id}:${id}`;
}

export function ExtensionConversationControls({
  active,
  onSelect,
}: {
  active: string | null;
  onSelect: (key: string | null) => void;
}) {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useRendererContext();
  const views = renderers.flatMap((ext) =>
    (ext.renderer.conversationViews ?? []).map((view) => ({ ext, view, key: conversationViewKey(ext, view.id) })),
  );

  if (views.length === 0) return null;

  return (
    <div className="flex min-w-0 max-w-[min(32vw,22rem)] items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
      {views.map(({ ext, view, key }) => (
        <Button
          key={`${key}:${sessionKey(base)}`}
          variant={active === key ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={active === key}
          title={view.label}
          className="max-w-32 min-w-0 shrink-0 truncate"
          onClick={() => onSelect(active === key ? null : key)}
        >
          <span className="min-w-0 truncate">
            <ExtensionBoundary name={ext.name} extensionId={ext.id}>
              <ExtensionContribution render={() => view.control?.(contextFor(base, ext)) ?? view.label} />
            </ExtensionBoundary>
          </span>
        </Button>
      ))}
    </div>
  );
}

export function ExtensionConversationView({ active, onClose }: { active: string; onClose: () => void }) {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useRendererContext();
  const found = renderers.flatMap((ext) =>
    (ext.renderer.conversationViews ?? []).map((view) => ({ ext, view, key: conversationViewKey(ext, view.id) })),
  ).find((entry) => entry.key === active);

  if (!found) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to chat
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          This view is no longer available. It may have been removed or renamed.
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to chat
        </Button>
        <span aria-hidden="true" className="text-muted-foreground/40">/</span>
        <h2 className="truncate font-heading text-sm font-semibold" title={found.view.label}>
          {found.view.label}
        </h2>
      </div>
      <div className="min-h-0 flex-1">
        <ExtensionBoundary key={`${found.key}:${sessionKey(base)}`} name={found.ext.name} extensionId={found.ext.id}>
          <ExtensionContribution render={() => found.view.render(contextFor(base, found.ext))} />
        </ExtensionBoundary>
      </div>
    </div>
  );
}

export function ExtensionPanels() {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useRendererContext();
  const panels = renderers.flatMap((ext) => (ext.renderer.panels ?? []).map((p) => ({ ext, p })));
  if (panels.length === 0) return null;

  return (
    <div className="flex flex-col gap-5 px-3 pt-5 pb-6">
      {panels.map(({ ext, p }) => (
        <section key={`${ext.id}:${p.id}:${sessionKey(base)}`} className="flex flex-col gap-2">
          <h3 className="font-heading text-sm font-semibold text-foreground">{p.title}</h3>
          <ExtensionBoundary name={ext.name} extensionId={ext.id}>
            <ExtensionContribution render={() => p.render(contextFor(base, ext))} />
          </ExtensionBoundary>
        </section>
      ))}
    </div>
  );
}
