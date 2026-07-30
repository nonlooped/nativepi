import { getKeybindings, setKeybindings, type AutocompleteProvider, type Component } from "@earendil-works/pi-tui";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type {
  TuiClientFrame,
  TuiCompletionEdit,
  TuiCompletions,
  TuiHostFrame,
  TuiPlacement,
  TuiSurface as TuiSurfaceInfo,
  TuiUiState,
} from "../../../shared/tui-frames.ts";
import { Surface } from "./surface.ts";

/**
 * The terminal half of `ctx.ui`, implemented instead of stubbed.
 *
 * Pi builds an `ExtensionUIContext` per mode, and RPC mode's is honest about what
 * a pipe cannot do: `custom()` returns undefined, component widgets are dropped,
 * footers and headers are no-ops. Everything that returns a value over the wire —
 * the four dialogs, `notify`, `setStatus`, string widgets, `setTitle` — already
 * works, and NativePi already renders it natively.
 *
 * So this does not replace Pi's context, it layers over it: every method Pi
 * implements is delegated untouched, and only the ones that need a terminal are
 * answered here, by running the component against a headless TUI (see
 * `surface.ts`) and shipping the frames to the window.
 *
 * `mode` is reported to extensions as `"tui"` once this is installed, because
 * that is the flag extensions guard terminal UI behind and the guard is now true.
 * The three methods still out of reach say so below, so the claim stays honest.
 */

/** What the host needs from the stdio channel, so this module never touches it. */
export interface HostChannel {
  send: (frame: TuiHostFrame) => void;
}

let nextId = 1;

function surfaceId(): string {
  return `s${nextId++}`;
}

/**
 * Adopt Pi's own keybindings if they can be reached.
 *
 * Components built out of Pi's exported parts call pi-tui's `getKeybindings()`,
 * which lazily falls back to pi-tui's own definitions — enough to render, but
 * missing Pi's app bindings and the user's `keybindings.json`. RPC mode never
 * sets the global because it never draws anything, so this does it: the manager
 * lives in a module Pi's `exports` map does not publish, so it is imported by
 * file URL next to the entry point that is published, and a failure is simply
 * the fallback that was already in place.
 */
async function adoptPiKeybindings(): Promise<void> {
  try {
    const index = import.meta.resolve("@earendil-works/pi-coding-agent");
    const module = (await import(new URL("./core/keybindings.js", index).href)) as {
      KeybindingsManager?: { create(): unknown };
    };
    const manager = module.KeybindingsManager?.create();
    if (manager) setKeybindings(manager as Parameters<typeof setKeybindings>[0]);
  } catch {
  }
}

/**
 * Wrap Pi's RPC UI context so the terminal-only half works.
 *
 * `base` is whatever Pi built for the mode it thinks it is in; the returned
 * object is spread over it, so a method added to `ExtensionUIContext` in a later
 * Pi release keeps Pi's implementation rather than disappearing.
 */
export function withTerminalUi(base: ExtensionUIContext, channel: HostChannel): ExtensionUIContext {
  void adoptPiKeybindings();

  /** Live panes, with the `open` frame each one was announced by, so it can be re-sent. */
  const surfaces = new Map<string, { surface: Surface; info: TuiSurfaceInfo }>();
  /** Component-backed widgets, footer and header, keyed to survive replacement. */
  const slots = new Map<string, string>();
  const statuses = new Map<string, string>();
  const providers: AutocompleteProvider[] = [];
  let editorText = "";
  let toolsExpanded = false;
  /** Every chrome patch sent so far, folded, for the same replay. */
  let uiState: TuiUiState = {};

  function open(placement: TuiPlacement, key: string): { id: string; surface: Surface } {
    const id = surfaceId();
    const surface = new Surface((data) => channel.send({ type: "nativepi_tui_write", surfaceId: id, data }));
    const info: TuiSurfaceInfo = { id, placement, key };
    surfaces.set(id, { surface, info });
    channel.send({ type: "nativepi_tui_open", surface: info });
    return { id, surface };
  }

  function close(id: string): void {
    const entry = surfaces.get(id);
    if (!entry) return;
    surfaces.delete(id);
    entry.surface.dispose();
    channel.send({ type: "nativepi_tui_close", surfaceId: id });
  }

  /** The characters every loaded provider declared, as one set. */
  function triggerCharacters(): string[] {
    return [...new Set(providers.flatMap((provider) => provider.triggerCharacters ?? []))];
  }

  /**
   * Say everything again for a window that arrived without it.
   *
   * The window folds frames in only for the project it is showing, so a project
   * worked on in the background has a live context whose `open`, `state` and
   * `triggers` frames were sent to nobody. Coming back asks for them again, and
   * each surface is forced to redraw so the pane has a complete picture to mount
   * rather than the tail of a differential stream.
   */
  function resync(): void {
    channel.send({ type: "nativepi_tui_triggers", characters: triggerCharacters() });
    channel.send({ type: "nativepi_tui_state", state: uiState });
    for (const { surface, info } of surfaces.values()) {
      channel.send({ type: "nativepi_tui_open", surface: info });
      surface.redraw();
    }
  }

  /** Replace whatever occupies a named slot, closing the component that was there. */
  function fillSlot(slot: string, placement: TuiPlacement, key: string, build: ((surface: Surface) => Component) | null): void {
    const previous = slots.get(slot);
    if (previous) {
      slots.delete(slot);
      close(previous);
    }
    if (!build) return;
    const { id, surface } = open(placement, key);
    slots.set(slot, id);
    try {
      surface.mount(build(surface));
    } catch (error) {
      // A factory that throws would otherwise leave an empty pane in the window
      // with no way to know it is never going to draw.
      close(id);
      base.notify(`Extension UI failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  function patch(state: TuiUiState): void {
    uiState = { ...uiState, ...state };
    channel.send({ type: "nativepi_tui_state", state });
  }

  const context: Partial<ExtensionUIContext> = {
    /**
     * A component with keyboard focus, for as long as it takes the user to answer.
     *
     * The promise settles when the component calls `done`, which is also what
     * tears the surface down — so a picker that is never answered stays open,
     * exactly as it would in the terminal, and the extension stays suspended on
     * its own `await` rather than being handed a value nobody chose.
     */
    async custom<T>(
      factory: Parameters<ExtensionUIContext["custom"]>[0],
      options?: Parameters<ExtensionUIContext["custom"]>[1],
    ): Promise<T> {
      const { id, surface } = open("overlay", "Extension");
      try {
        return await new Promise<T>((resolve) => {
          let settled = false;
          const done = (result: unknown) => {
            if (settled) return;
            settled = true;
            close(id);
            resolve(result as T);
          };
          void (async () => {
            // Pi's keybindings manager where `adoptPiKeybindings` reached it, and
            // pi-tui's own where it did not. The extra methods Pi's subclass adds
            // are for reloading its config file, which no component calls.
            const keybindings = getKeybindings() as Parameters<typeof factory>[2];
            const component = await factory(surface.tui, base.theme, keybindings, done as Parameters<typeof factory>[3]);
            if (settled) return;
            const overlayOptions =
              typeof options?.overlayOptions === "function" ? options.overlayOptions() : options?.overlayOptions;
            // `overlay: true` is the extension asking the TUI to position and size
            // the component; anything else fills the surface, which is a modal in
            // the window either way.
            const handle = surface.mount(component, options?.overlay ? { options: overlayOptions } : undefined);
            if (handle) options?.onHandle?.(handle);
          })().catch((error: unknown) => {
            close(id);
            base.notify(`Extension UI failed: ${error instanceof Error ? error.message : String(error)}`, "error");
            resolve(undefined as T);
          });
        });
      } finally {
        close(id);
      }
    },

    setWidget(
      key: string,
      content: string[] | ((...args: never[]) => Component & { dispose?(): void }) | undefined,
      options?: { placement?: "aboveEditor" | "belowEditor" },
    ): void {
      const placement = options?.placement ?? "aboveEditor";
      if (typeof content === "function") {
        const factory = content as (tui: unknown, theme: unknown) => Component & { dispose?(): void };
        // A key holds one widget, whichever kind it is. If lines were set under
        // this key first, Pi's context is still rendering them, and mounting the
        // component without clearing them would show the extension's old widget
        // above its new one rather than in place of it.
        base.setWidget(key, undefined, options);
        fillSlot(`widget:${key}`, placement, key, (surface) => factory(surface.tui, base.theme));
        return;
      }
      // Lines, or a clear. Pi's own context renders both, and a key that used to
      // hold a component has to give the pane back before the lines replace it.
      fillSlot(`widget:${key}`, placement, key, null);
      base.setWidget(key, content, options);
    },

    setFooter(factory: Parameters<ExtensionUIContext["setFooter"]>[0]): void {
      fillSlot("footer", "footer", "Footer", factory ? (surface) => factory(surface.tui, base.theme, footerData) : null);
    },

    setHeader(factory: Parameters<ExtensionUIContext["setHeader"]>[0]): void {
      fillSlot("header", "header", "Header", factory ? (surface) => factory(surface.tui, base.theme) : null);
    },

    setStatus(key: string, text: string | undefined): void {
      // Tracked as well as forwarded: a custom footer reads these back through
      // the data provider below, and only this layer sees every call.
      if (text === undefined) statuses.delete(key);
      else statuses.set(key, text);
      base.setStatus(key, text);
      // Pi's own footer redraws when a status changes; a custom one reads the map
      // above through `footerData` and has no way to know it moved, so it would
      // otherwise hold its first values until an unrelated resize.
      const footer = slots.get("footer");
      if (footer) surfaces.get(footer)?.surface.render();
    },

    setWorkingMessage(message?: string): void {
      patch({ workingMessage: message ?? null });
    },

    setWorkingVisible(visible: boolean): void {
      patch({ workingVisible: visible });
    },

    setWorkingIndicator(options?: { frames?: string[]; intervalMs?: number }): void {
      patch({
        workingIndicator: options ? { frames: options.frames ?? [], intervalMs: options.intervalMs ?? 120 } : null,
      });
    },

    setHiddenThinkingLabel(label?: string): void {
      patch({ hiddenThinkingLabel: label ?? null });
    },

    /**
     * A paste, not a replacement.
     *
     * Pi's context sends this as `set_editor_text`, which overwrites whatever the
     * user was writing. The composer can collapse a large paste and insert at the
     * caret, so it gets the distinction the TUI editor makes.
     */
    pasteToEditor(text: string): void {
      channel.send({ type: "nativepi_tui_paste", text });
    },

    /** The composer's own text, pushed here as the user types. */
    getEditorText(): string {
      return editorText;
    },

    /**
     * Whether tool output is shown expanded, as far as extensions are concerned.
     *
     * Tracked here rather than read back from the window, because the window has
     * no single answer: every response in the transcript has its own work section
     * that the user can open. What this has to be true for is the pattern the
     * setter exists to support — read the value, change it, put it back — and for
     * that the host's own record is the honest one.
     */
    getToolsExpanded(): boolean {
      return toolsExpanded;
    },

    setToolsExpanded(expanded: boolean): void {
      toolsExpanded = expanded;
      patch({ toolsExpanded: expanded });
    },

    addAutocompleteProvider(factory: (current: AutocompleteProvider) => AutocompleteProvider): void {
      // Stacked over an empty provider rather than over Pi's: Pi's built-in
      // completions are the terminal editor's, and the composer has its own
      // commands, skills and files. A provider that delegates instead of
      // answering returns nothing, and the composer's own menus take the turn.
      providers.push(factory(providers[providers.length - 1] ?? EMPTY_PROVIDER));
      channel.send({ type: "nativepi_tui_triggers", characters: triggerCharacters() });
    },
  };

  const footerData = {
    getGitBranch: () => null,
    getExtensionStatuses: () => statuses as ReadonlyMap<string, string>,
    getAvailableProviderCount: () => 0,
    onBranchChange: () => () => {},
  };

  /**
   * Answer the frames the window sends: keystrokes, sizes, and the composer state
   * the synchronous getters above report.
   */
  function handle(frame: TuiClientFrame): void {
    switch (frame.type) {
      case "nativepi_tui_input":
        surfaces.get(frame.surfaceId)?.surface.input(frame.data);
        return;
      case "nativepi_tui_resize":
        surfaces.get(frame.surfaceId)?.surface.resize(frame.cols, frame.rows);
        return;
      case "nativepi_tui_editor":
        editorText = frame.text;
        return;
      case "nativepi_tui_sync":
        resync();
        return;
      case "nativepi_tui_complete":
        void reply(frame.requestId, async (): Promise<TuiCompletions | null> => {
          const provider = providers[providers.length - 1];
          if (!provider) return null;
          const suggestions = await provider.getSuggestions(frame.lines, frame.cursorLine, frame.cursorCol, {
            signal: new AbortController().signal,
          });
          return suggestions ? { prefix: suggestions.prefix, items: suggestions.items } : null;
        });
        return;
      case "nativepi_tui_apply":
        void reply(frame.requestId, (): TuiCompletionEdit | null => {
          const provider = providers[providers.length - 1];
          if (!provider) return null;
          return provider.applyCompletion(frame.lines, frame.cursorLine, frame.cursorCol, frame.item, frame.prefix);
        });
        return;
    }
  }

  async function reply(requestId: string, produce: () => unknown): Promise<void> {
    try {
      channel.send({ type: "nativepi_tui_reply", requestId, data: await produce() });
    } catch (error) {
      channel.send({
        type: "nativepi_tui_reply",
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Closed when Pi rebinds extensions, so a replaced session leaves no panes behind. */
  function dispose(): void {
    for (const id of [...surfaces.keys()]) close(id);
    slots.clear();
    statuses.clear();
    providers.length = 0;
    toolsExpanded = false;
    channel.send({ type: "nativepi_tui_triggers", characters: [] });
    // Chrome an extension changed belongs to it for as long as it is bound. The
    // panes above go with the context, but a working message, a spinner or an
    // expanded tool section is a value the window is merging and holding: left
    // alone it survives the extension that set it, with nobody to restore it.
    patch({
      workingMessage: null,
      workingVisible: true,
      workingIndicator: null,
      hiddenThinkingLabel: null,
      toolsExpanded: false,
    });
    uiState = {};
  }

  /**
   * Still not supported, and still saying so.
   *
   * - `onTerminalInput` wants the raw stream of a terminal NativePi does not have.
   * - `setEditorComponent` replaces the input editor, which here is the composer:
   *   a React control with attachments, drag and drop and its own autocomplete.
   * - `setTheme` and `getAllThemes` are Pi's terminal palettes; the window's
   *   colours are its own. `ctx.ui.theme` is Pi's, and components rendered above
   *   are drawn with it.
   *
   * Each keeps Pi's RPC behaviour by delegation rather than being reimplemented
   * badly, so an extension that calls one gets the documented no-op.
   */
  const merged = Object.assign(Object.create(base) as ExtensionUIContext, context);
  return Object.assign(merged, { [HOST_INTERNALS]: { handle, dispose } });
}

const EMPTY_PROVIDER: AutocompleteProvider = {
  getSuggestions: () => Promise.resolve(null),
  applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
};

/** How the entry point reaches the two hooks above without widening `ctx.ui`. */
export const HOST_INTERNALS = Symbol("nativepi.tuiHost");

export interface HostInternals {
  handle: (frame: TuiClientFrame) => void;
  dispose: () => void;
}

export function hostInternals(context: ExtensionUIContext): HostInternals | undefined {
  return (context as unknown as Record<symbol, HostInternals>)[HOST_INTERNALS];
}
