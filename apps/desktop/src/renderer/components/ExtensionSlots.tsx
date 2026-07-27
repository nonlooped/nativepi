import type { NativePiContext, SessionEntry as ExtSessionEntry, ToolResult } from "@nativepi/extension-api";
import type { SessionEntry, ToolCall, ToolResultMessage } from "../../shared/pi-types.ts";
import { textOf } from "../../shared/messages.ts";
import { activeConversation, useAppStore } from "../lib/store.ts";
import ExtensionBoundary from "./ExtensionBoundary.tsx";


function useNativePiContext(): NativePiContext {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const sessionName = useAppStore((s) => activeConversation(s).sessionName);
  const dark = typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : true;
  return {
    session: projectDir ? { projectDir, sessionFile: sessionFile ?? undefined, sessionName } : null,
    dark,
  };
}

export function ExtensionToolResult({ call, result }: { call: ToolCall; result?: ToolResultMessage }) {
  const renderers = useAppStore((s) => s.extRenderers);
  const ctx = useNativePiContext();

  for (const ext of renderers) {
    const render = ext.renderer.tools?.[call.name];
    if (!render) continue;
    const toolResult: ToolResult | undefined = result
      ? { toolName: result.toolName, text: textOf(result.content), details: result.details, isError: result.isError }
      : undefined;
    return (
      <ExtensionBoundary name={ext.name}>
        {render({ call: { id: call.id, name: call.name, arguments: call.arguments }, result: toolResult, ctx })}
      </ExtensionBoundary>
    );
  }
  return null;
}

export function ExtensionEntry({ entry }: { entry: SessionEntry }) {
  const renderers = useAppStore((s) => s.extRenderers);
  const ctx = useNativePiContext();

  for (const ext of renderers) {
    const render = ext.renderer.entries?.[entry.type];
    if (!render) continue;
    return (
      <ExtensionBoundary name={ext.name}>
        {render({ entry: entry as unknown as ExtSessionEntry, ctx })}
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
  const ctx = useNativePiContext();

  const serializablePlacement = placement === "aboveComposer" ? "aboveEditor" : "belowEditor";
  const serializable = Object.entries(widgets).filter(([, w]) => w.placement === serializablePlacement);
  const graphical = renderers.flatMap((ext) =>
    (ext.renderer.composerWidgets ?? [])
      .filter((w) => w.placement === placement)
      .map((w) => ({ ext, w })),
  );

  if (serializable.length === 0 && graphical.length === 0) return null;

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
        <ExtensionBoundary key={`${ext.id}:${w.key}`} name={ext.name}>
          {w.render(ctx)}
        </ExtensionBoundary>
      ))}
    </div>
  );
}

export function ExtensionPanels() {
  const renderers = useAppStore((s) => s.extRenderers);
  const ctx = useNativePiContext();
  const panels = renderers.flatMap((ext) => (ext.renderer.panels ?? []).map((p) => ({ ext, p })));
  if (panels.length === 0) return null;

  return (
    <div className="flex flex-col">
      {panels.map(({ ext, p }) => (
        <section key={`${ext.id}:${p.key}`} className="border-b p-3">
          <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{p.title}</h3>
          <ExtensionBoundary name={ext.name}>{p.render(ctx)}</ExtensionBoundary>
        </section>
      ))}
    </div>
  );
}
