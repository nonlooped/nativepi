import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { TuiSurface } from "../../shared/tui-frames.ts";
import { rpc } from "../lib/rpc.ts";
import { useAppStore } from "../lib/store.ts";
import { onSurfaceWrite, surfaceBuffer } from "../lib/tuiSurfaces.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

/**
 * A pi-tui component, on screen.
 *
 * The component itself runs in the Pi process, where it renders to escape
 * sequences and reads keystrokes — see `main/pi/host`. This is the other end:
 * xterm turns those sequences back into the picture Pi drew, and hands back the
 * keys it encodes, which is why the fidelity is exact rather than approximated.
 * NativePi is a courier here, and deliberately so; a re-implementation of pi-tui
 * in the DOM would be a second renderer to keep in step with Pi's.
 *
 * Sizing runs the other way from the rest of the app: the pane measures itself
 * and tells the component how many columns it has, because a terminal component
 * lays itself out in cells and cannot be asked to reflow like a div.
 */

/** Matches the integrated terminal, so extension UI and shell output read alike. */
const FONT_FAMILY = "Consolas, 'Cascadia Mono', ui-monospace, monospace";
// xterm clamps this to its unsigned-integer ceiling: effectively unlimited
// without NativePi choosing a content limit for historical timeline entries.
const UNLIMITED_SCROLLBACK = Number.MAX_SAFE_INTEGER;

function useSurfaceTerminal(
  surface: TuiSurface,
  projectDir: string | null,
  options: { rows?: number; focus: boolean; onRows?: (rows: number) => void; maxRows?: number; scrollback?: number },
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fontSize = useAppStore((s) => s.preferences.terminalFontSize);
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const { rows, focus, onRows, maxRows = 24, scrollback = 0 } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const styles = getComputedStyle(document.documentElement);
    const terminal = new Terminal({
      // The component draws its own cursor when it wants one; xterm's would be a
      // second one, blinking in a place the component knows nothing about.
      cursorInactiveStyle: "none",
      cursorStyle: "bar",
      cursorBlink: false,
      fontFamily: FONT_FAMILY,
      fontSize,
      lineHeight: 1.2,
      // Live surfaces repaint in place, so they have no scrollback. Timeline
      // entries are historical output and opt into retaining their full stream.
      scrollback,
      screenReaderMode: true,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        foreground: styles.getPropertyValue("--foreground").trim(),
        cursor: styles.getPropertyValue("--foreground").trim(),
        selectionBackground: styles.getPropertyValue("--accent").trim(),
      },
      allowTransparency: true,
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    // Everything drawn since the component's last full redraw, so a pane that
    // remounts shows what is there rather than waiting for the next keystroke.
    const reportRows = () => {
      if (!onRows || disposed) return;
      try {
        const buffer = terminal.buffer.active;
        let lastNonEmpty = 0;
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (!line) continue;
          if (line.translateToString(true).trim() !== "") lastNonEmpty = i + 1;
        }
        // Fallback for surfaces that draw only block characters with no trimmed text
        // or for an empty buffer before the first write has been processed.
        const cursorRows = buffer.baseY + buffer.cursorY + 1;
        const contentRows = lastNonEmpty || cursorRows;
        onRows(Math.max(1, Math.min(maxRows, contentRows)));
      } catch {
        return;
      }
    };
    terminal.write(surfaceBuffer(surface.id), reportRows);

    const offWrite = onSurfaceWrite(surface.id, (data) => terminal.write(data, reportRows));
    const input = terminal.onData((data) => {
      if (!projectDir) return;
      void rpc.request.tuiSend({
        projectDir,
        sessionFile,
        frame: { type: "nativepi_tui_input", surfaceId: surface.id, data },
      });
    });

    let frame = 0;
    let focusFrame = 0;
    // An auto-sizing pane changes its own height from what the component drew,
    // which the observer sees as a resize. The size it reports has not changed,
    // so telling the component again would be a redraw per redraw.
    let sent = "";
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return;
        // Height is the pane's to decide for a widget or a footer — the component
        // is one part of a window, not the whole screen — so only the width comes
        // from fitting, and `rows` is what the caller has room for.
        const dimensions = fit.proposeDimensions();
        if (!dimensions?.cols) return;
        const nextRows = rows ?? dimensions.rows;
        if (terminal.cols !== dimensions.cols || terminal.rows !== nextRows) {
          terminal.resize(dimensions.cols, Math.max(1, nextRows));
        }
        if (!projectDir) return;
        const size = `${dimensions.cols}x${Math.max(1, nextRows)}`;
        if (size === sent) return;
        sent = size;
        void rpc.request.tuiSend({
          projectDir,
          sessionFile,
          frame: {
            type: "nativepi_tui_resize",
            surfaceId: surface.id,
            cols: dimensions.cols,
            rows: Math.max(1, nextRows),
          },
        });
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    // The dialog installs its own focus trap after children mount. Focus on the
    // next frame so arrows and Escape belong to the terminal, not its close button.
    if (focus) focusFrame = requestAnimationFrame(() => terminal.focus());

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      input.dispose();
      offWrite();
      terminal.dispose();
    };
  }, [focus, fontSize, maxRows, onRows, projectDir, rows, scrollback, sessionFile, surface.id]);

  return containerRef;
}

/**
 * The modal half: `ctx.ui.custom()` with `overlay: true`, which takes over the keyboard until answered.
 *
 * Only one is shown at a time even if an extension opens two, because the second
 * one's component is waiting on a keyboard the first one holds — the same
 * ordering the terminal imposes, and the same rule the dialog queue already uses
 * for Pi's own extension prompts.
 */
export default function TuiOverlay() {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const surface = useAppStore((s) => s.extSurfaces.find((candidate) => candidate.placement === "overlay"));
  return surface ? <TuiOverlayDialog key={surface.id} surface={surface} projectDir={projectDir} /> : null;
}

function TuiOverlayDialog({ surface, projectDir }: { surface: TuiSurface; projectDir: string | null }) {
  const sessionFile = useAppStore((s) => s.activeSessionFile);
  const cancel = () => {
    if (!projectDir) return;
    void rpc.request.tuiSend({
      projectDir,
      sessionFile,
      frame: { type: "nativepi_tui_input", surfaceId: surface.id, data: "\u001b" },
    });
  };

  return (
    // NativePi cannot dismiss this locally: the extension is awaiting `done()`.
    // Dialog dismissal is therefore translated to Escape, the same key its TUI
    // names for cancel, so the extension resolves its own promise and closes.
    <Dialog
      open
      onOpenChange={(open, details) => {
        // Focused xterm already receives Escape itself. Translate only pointer
        // dismissal and the visible close button, or Escape would be sent twice.
        if (!open && details.reason !== "escape-key") cancel();
      }}
    >
      <DialogContent className="flex h-[min(90dvh,64rem)] w-[min(96vw,112rem)] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-base font-semibold">{surface.key}</DialogTitle>
          <DialogDescription className="text-sm text-body-muted-foreground">
            An extension is showing this and is waiting for you to answer it. Use the keys it names.
          </DialogDescription>
        </DialogHeader>
        <TuiOverlayTerminal surface={surface} projectDir={projectDir} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted by the portal with its element, so the terminal effect always receives the ref. */
function TuiOverlayTerminal({ surface, projectDir }: { surface: TuiSurface; projectDir: string | null }) {
  const containerRef = useSurfaceTerminal(surface, projectDir, { focus: true });
  return <div ref={containerRef} className="terminal-surface min-h-0 w-full flex-1" />;
}

/**
 * The inline half: component widgets, footers and headers.
 *
 * `rows` is the caller's, for the reason above: these sit in a window that has
 * already decided how much room the surface gets.
 */
export function TuiAutoPane({
  surface,
  maxRows = 24,
  scrollback = 0,
  focus = false,
}: {
  surface: TuiSurface;
  maxRows?: number;
  scrollback?: number;
  focus?: boolean;
}) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const [visibleRows, setVisibleRows] = useState(1);
  const containerRef = useSurfaceTerminal(surface, projectDir, {
    // Pi always gets the slot's full grid. Feeding the currently visible height
    // back to it traps a dynamic widget at its smallest render, because clipped
    // rows can never be measured and made visible again.
    rows: maxRows,
    focus,
    onRows: (next) =>
      setVisibleRows((prev) => {
        const clamped = Math.max(1, Math.min(maxRows, next));
        return clamped === prev ? prev : clamped;
      }),
    maxRows,
    scrollback,
  });
  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={`${surface.key} (extension)`}
      className="terminal-surface w-full overflow-hidden"
      style={{ height: `calc(${visibleRows} * 1.2em)` }}
    />
  );
}

export function TuiTimelineEntry({ surface }: { surface: TuiSurface }) {
  return <TuiAutoPane surface={surface} scrollback={UNLIMITED_SCROLLBACK} />;
}

export function TuiPane({ surface, rows }: { surface: TuiSurface; rows: number }) {
  const projectDir = useAppStore((s) => s.activeProjectPath);
  const containerRef = useSurfaceTerminal(surface, projectDir, { rows, focus: false });
  return (
    // A labelled group rather than a bare div: `aria-label` on a role-less
    // element is dropped, and xterm's own output underneath carries no hint
    // that it came from an extension.
    <div
      ref={containerRef}
      role="group"
      aria-label={`${surface.key} (extension)`}
      className="terminal-surface w-full overflow-hidden"
      style={{ height: `calc(${rows} * 1.2em)` }}
    />
  );
}
