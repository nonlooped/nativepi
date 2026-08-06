import type { NativePiContext, SessionEntry as ExtSessionEntry, ToolResult } from "@nativepi/extension-api";
import type { ReactNode } from "react";
import type { SessionEntry, ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";
import { textOf } from "../../shared/messages.ts";
import { subscribeToExtension } from "../lib/extensionHost.ts";
import { rpc } from "../lib/rpc.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import ExtensionBoundary from "./ExtensionBoundary.tsx";
import { SettingsSection } from "./settings/rows.tsx";
import { TuiPane } from "./TuiSurface.tsx";

type BaseContext = Omit<NativePiContext, "call" | "on">;

/**
 * The channel half of an extension's context, made once per extension.
 *
 * Stable across renders on purpose: an extension subscribing in `useEffect`
 * would otherwise resubscribe on every render, since the context object itself
 * is rebuilt each time. Both functions read the session when they are called
 * rather than when they are built, which is also the correct reading — a call
 * fired from a click belongs to the session on screen then, not at render.
 */
const bridges = new Map<string, Pick<NativePiContext, "call" | "on">>();

function bridgeFor(extension: string): Pick<NativePiContext, "call" | "on"> {
  const existing = bridges.get(extension);
  if (existing) return existing;

  const bridge: Pick<NativePiContext, "call" | "on"> = {
    call: async (method, params) => {
      const { activeProjectPath: projectDir, activeSessionFile: sessionFile } = useAppStore.getState();
      if (!projectDir) throw new Error("No project is open");
      const { result, error } = await rpc.request.callExtension({ projectDir, sessionFile, extension, method, params });
      if (error) throw new Error(error);
      const current = useAppStore.getState();
      if (current.activeProjectPath !== projectDir || current.activeSessionFile !== sessionFile) {
        throw new Error("Chat changed before the extension call completed");
      }
      if (result === undefined) throw new Error("Extension call returned no result");
      return result;
    },
    on: (event, handler) =>
      subscribeToExtension(extension, (name, payload) => {
        if (name === event) handler(payload);
      }),
  };
  bridges.set(extension, bridge);
  return bridge;
}

function contextFor(base: BaseContext, extension: string): NativePiContext {
  return { ...base, ...bridgeFor(extension) };
}

function useNativePiContext(): BaseContext {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const sessionName = useAppStore((s) => activeConversation(s).sessionName);
  const dark = typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : true;
  return {
    session: projectDir ? { projectDir, sessionFile: sessionFile ?? undefined, sessionName } : null,
    dark,
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
  return ctx.session?.sessionFile ?? "new";
}

export function ExtensionToolResult({ call, result }: { call: ToolCall; result?: ToolResultMessage }) {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useNativePiContext();

  for (const ext of renderers) {
    const render = ext.renderer.tools?.[call.name];
    if (!render) continue;
    const toolResult: ToolResult | undefined = result
      ? { toolName: result.toolName, text: textOf(result.content), details: result.details, isError: result.isError }
      : undefined;
    return (
      <ExtensionBoundary key={`${ext.id}:${call.id}:${sessionKey(base)}`} name={ext.name}>
        <ExtensionContribution
          render={() =>
            render({
              call: { id: call.id, name: call.name, arguments: call.arguments },
              result: toolResult,
              ctx: contextFor(base, ext.name),
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
  const base = useNativePiContext();

  for (const ext of renderers) {
    const render = ext.renderer.entries?.[entry.type];
    if (!render) continue;
    return (
      <ExtensionBoundary key={`${ext.id}:${entry.id}:${sessionKey(base)}`} name={ext.name}>
        <ExtensionContribution render={() => render({ entry: entry as unknown as ExtSessionEntry, ctx: contextFor(base, ext.name) })} />
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
  const base = useNativePiContext();

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
        <ExtensionBoundary key={`${ext.id}:${w.key}:${sessionKey(base)}`} name={ext.name}>
          <ExtensionContribution render={() => w.render(contextFor(base, ext.name))} />
        </ExtensionBoundary>
      ))}
      {terminal.map((surface) => (
        <div key={surface.id} className="rounded-xl border bg-card/60 px-3 py-1.5">
          <TuiPane surface={surface} rows={WIDGET_ROWS} />
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
const WIDGET_ROWS = 3;

export function ComposerControls() {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useNativePiContext();
  const controls = renderers.flatMap((ext) => (ext.renderer.composerControls ?? []).map((c) => ({ ext, c })));

  return controls.map(({ ext, c }) => (
    <ExtensionBoundary key={`${ext.id}:${c.key}:${sessionKey(base)}`} name={ext.name}>
      <ExtensionContribution render={() => c.render(contextFor(base, ext.name))} />
    </ExtensionBoundary>
  ));
}

export function ExtensionSettings() {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useNativePiContext();
  const sections = renderers.flatMap((ext) => (ext.renderer.settings ?? []).map((s) => ({ ext, s })));

  return sections.map(({ ext, s }) => (
    <SettingsSection key={`${ext.id}:${s.key}:${sessionKey(base)}`} heading={s.heading} description={s.description}>
      <ExtensionBoundary name={ext.name}>
        <ExtensionContribution render={() => s.render(contextFor(base, ext.name))} />
      </ExtensionBoundary>
    </SettingsSection>
  ));
}

export function ExtensionPanels() {
  const renderers = useAppStore((s) => s.extRenderers);
  const base = useNativePiContext();
  const panels = renderers.flatMap((ext) => (ext.renderer.panels ?? []).map((p) => ({ ext, p })));
  if (panels.length === 0) return null;

  return (
    <div className="flex flex-col">
      {panels.map(({ ext, p }) => (
        <section key={`${ext.id}:${p.key}:${sessionKey(base)}`} className="border-b p-3">
          <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{p.title}</h3>
          <ExtensionBoundary name={ext.name}>
            <ExtensionContribution render={() => p.render(contextFor(base, ext.name))} />
          </ExtensionBoundary>
        </section>
      ))}
    </div>
  );
}
